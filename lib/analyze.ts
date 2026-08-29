import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import {
  assertNoRefusal,
  FALLBACK_BETA,
  getClient,
  MODEL,
  POLARITY_GUARD,
  sanitizeForPrompt,
  TONE_RULE,
} from "./claude";

import { NORM_CARDS } from "./norms";
import { lookupGlossary, toHit, type GlossaryEntry } from "./glossary";
import {
  CULTURE_IDS,
  CULTURES,
  type BackTranslation,
  type CheckResult,
  type CultureId,
  type CultureReading,
  type Verdict,
} from "./types";

// ── スキーマ ───────────────────────────────────────────────────

const cultureIdSchema = z.enum(CULTURE_IDS);

const PanelSchema = z.object({
  readings: z.array(
    z.object({
      culture: cultureIdSchema,
      verdict: z.enum(["green", "yellow", "red"]),
      risk: z.number().min(0).max(100),
      reading: z.string(),
      triggers: z.array(z.object({ span: z.string(), why: z.string() })),
      rewrite: z.string().nullable(),
    }),
  ),
});

const GateSchema = z.object({
  results: z.array(
    z.object({
      culture: cultureIdSchema,
      translation: z.string(),
      back_translation: z.string(),
      polarity: z.number().min(0).max(100),
      register: z.number().min(0).max(100),
      entities: z.number().min(0).max(100),
      negation: z.number().min(0).max(100),
      drift: z.string().nullable(),
    }),
  ),
});

// ── プロンプト ─────────────────────────────────────────────────

/**
 * 用語集は全語彙を詰めず、原文にヒットしたものだけを動的注入する。
 * 無関係な語まで入れると文脈が汚れて精度が落ちる。
 */
function glossaryBlock(hits: GlossaryEntry[]): string {
  if (hits.length === 0) return "（原文に既知のファンダム語彙は検出されなかった）";
  return hits
    .map(
      (h) =>
        `- 「${h.term}」: ${h.meaning}\n  極性=${h.polarity} 強度=${h.intensity}/5\n  ` +
        `よくある誤訳: ${h.commonMistranslation}\n  起きること: ${h.danger}`,
    )
    .join("\n");
}

function panelSystem(hits: GlossaryEntry[]): string {
  const cards = CULTURE_IDS.map((id) => {
    const items = NORM_CARDS[id].map((n, i) => `  ${i + 1}. ${n}`).join("\n");
    return `## ${id}（${CULTURES[id].label}）\n${items}`;
  }).join("\n\n");

  return `あなたは越境ファンダムの文化翻訳を専門とする分析者である。
一つの投稿文が、4つのファンダム文化圏それぞれの読者に「どう着弾するか」を並列に判定する。

${TONE_RULE}

${POLARITY_GUARD}

# 文化規範カード
各文化圏の読者は以下の規範を内面化している。この規範に照らして読め。

${cards}

# 原文に検出されたファンダム語彙
${glossaryBlock(hits)}

# 出力ルール
- 4文化すべてについて必ず1件ずつ返す。
- reading は「その文化圏の読者にはこう読める」を、その読者の視点で2〜3文で書く。
  原文の意図の説明ではなく、受信側の解釈を書くこと。
- triggers.span は必ず**原文に実際に現れる部分文字列**をそのまま抜き出すこと。要約・言い換えは不可。
- 引っかかる箇所がなければ triggers は空配列にする。無理に作らない。
- verdict: green=そのまま出して問題ない / yellow=誤読される可能性がある / red=炎上リスクがある
- risk は verdict と整合させる（green は 0-25、yellow は 26-65、red は 66-100 の範囲）。
- rewrite はその文化圏向けの言い換え。green の場合は null。
  言い換えは原文の熱量と強度を保つこと。無難にして温度を落とすのは失敗である。`;
}

function gateSystem(hits: GlossaryEntry[]): string {
  return `あなたは翻訳品質の検査官である。原文を各言語に訳し、それを原語に戻し、
何が失われたかを4つの独立した次元で採点する。

${POLARITY_GUARD}

# 原文に検出されたファンダム語彙
${glossaryBlock(hits)}

# 手順
1. translation: 原文を対象言語に訳す。ただし oshi / bias / stan のように受信側コミュニティで
   既に借用語として流通している語は**訳さず原語のまま残す**こと。親切に訳してはならない。
2. back_translation: 1 の訳文だけを見て、原文を知らない人間として原語に戻す。
   原文に引きずられてはならない。訳文から読み取れる意味だけを書く。
3. 原文と back_translation を突き合わせ、次の4次元を独立に採点する（100=完全に保存、0=完全に失われた）。

- polarity: 感情の極性と強度。肯定が否定に反転していれば 0-20 を付ける。最重要次元。
- register: 敬語／タメ口／内輪ノリの距離感。丁寧さの度合いが変わっていないか。
- entities: 固有名詞・数値・日時。改変や欠落があれば大きく減点する。
- negation: 否定・二重否定・反語の構造が保たれているか。

4. drift: 失われたものを1〜2文で。全次元が高ければ null。

単純な文の類似度で判断してはならない。訳文が流暢でも極性が反転していれば polarity は 0-20 である。
4文化すべてについて必ず1件ずつ返すこと。`;
}

// ── 呼び出し ───────────────────────────────────────────────────

async function runPanel(client: Anthropic, input: string, hits: GlossaryEntry[]): Promise<CultureReading[]> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: panelSystem(hits),
    messages: [{ role: "user", content: `次の投稿文を判定せよ。\n\n<投稿文>\n${sanitizeForPrompt(input)}\n</投稿文>` }],
    output_config: { format: zodOutputFormat(PanelSchema) },
  });
  assertNoRefusal(res);
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("文化ペルソナ判定の構造化出力を取得できませんでした");

  const byCulture = new Map(parsed.readings.map((r) => [r.culture, r]));
  return CULTURE_IDS.map((id): CultureReading => {
    const r = byCulture.get(id);
    if (!r) {
      return { culture: id, verdict: "green", risk: 0, reading: "（判定を取得できませんでした）", triggers: [], rewrite: null };
    }
    return {
      culture: id,
      verdict: r.verdict,
      risk: Math.round(r.risk),
      reading: r.reading,
      // モデルが原文にない span を返すことがあるので、原文に実在するものだけ通す
      triggers: r.triggers.filter((t) => t.span.length > 0 && input.includes(t.span)),
      rewrite: r.rewrite,
    };
  });
}

async function runGate(client: Anthropic, input: string, hits: GlossaryEntry[]): Promise<BackTranslation[]> {
  const targets = CULTURE_IDS.map((id) => `- ${id}: ${CULTURES[id].language}`).join("\n");
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: gateSystem(hits),
    messages: [
      {
        role: "user",
        content: `次の原文を各言語へ訳し、逆翻訳して採点せよ。\n\n<原文>\n${sanitizeForPrompt(input)}\n</原文>\n\n<対象言語>\n${targets}\n</対象言語>`,
      },
    ],
    output_config: { format: zodOutputFormat(GateSchema) },
  });
  assertNoRefusal(res);
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("逆翻訳ゲートの構造化出力を取得できませんでした");

  const byCulture = new Map(parsed.results.map((r) => [r.culture, r]));
  return CULTURE_IDS.map((id): BackTranslation => {
    const r = byCulture.get(id);
    if (!r) {
      return {
        culture: id,
        translation: "",
        backTranslation: "",
        dimensions: { polarity: 0, register: 0, entities: 0, negation: 0 },
        drift: "（採点を取得できませんでした）",
      };
    }
    return {
      culture: id,
      translation: r.translation,
      backTranslation: r.back_translation,
      dimensions: {
        polarity: Math.round(r.polarity),
        register: Math.round(r.register),
        entities: Math.round(r.entities),
        negation: Math.round(r.negation),
      },
      drift: r.drift,
    };
  });
}

const RANK: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };

/**
 * 逆翻訳ゲート。極性が大きく壊れている文化は、ペルソナ判定が緩くても警告に昇格させる。
 * 「流暢な誤訳」はペルソナ側では見抜けないことがあるため、この昇格が安全弁になる。
 */
function applyGate(readings: CultureReading[], gates: BackTranslation[]): CultureReading[] {
  const byCulture = new Map(gates.map((g) => [g.culture, g]));
  return readings.map((r) => {
    const g = byCulture.get(r.culture);
    if (!g) return r;
    const { polarity, negation } = g.dimensions;
    const escalate: Verdict | null = polarity <= 20 || negation <= 20 ? "red" : polarity <= 55 ? "yellow" : null;
    if (!escalate || RANK[escalate] <= RANK[r.verdict]) return r;
    return {
      ...r,
      verdict: escalate,
      risk: Math.max(r.risk, escalate === "red" ? 70 : 40),
      reading:
        `${r.reading}\n\n【逆翻訳ゲートによる昇格】極性保存度 ${polarity}／否定保存度 ${negation}。` +
        `${g.drift ?? "訳文が原文の意味を保っていません。"}`,
    };
  });
}

function overallOf(readings: CultureReading[]): Verdict {
  return readings.reduce<Verdict>((worst, r) => (RANK[r.verdict] > RANK[worst] ? r.verdict : worst), "green");
}

export async function analyze(input: string): Promise<CheckResult> {
  const started = Date.now();
  const client = getClient();
  const hits = lookupGlossary(input);

  // ペルソナ判定と逆翻訳ゲートは互いに独立なので並列に走らせる。
  // ゲートだけ落ちた場合にペルソナ判定まで巻き添えで失うのは過剰なので、
  // allSettled で受けて部分的な結果を返せるようにしている。
  const [panelRes, gateRes] = await Promise.allSettled([
    runPanel(client, input, hits),
    runGate(client, input, hits),
  ]);

  // ペルソナ判定が落ちた場合だけは返せるものが無いので、そのまま失敗させる
  if (panelRes.status === "rejected") throw panelRes.reason;

  if (gateRes.status === "rejected") {
    console.error("[analyze] 逆翻訳ゲートに失敗したため、ペルソナ判定のみで返します", gateRes.reason);
  }
  const gates = gateRes.status === "fulfilled" ? gateRes.value : [];
  const cultures = applyGate(panelRes.value, gates);

  return {
    input,
    overall: overallOf(cultures),
    glossaryHits: hits.map(toHit),
    cultures,
    backTranslations: gates,
    mode: "live",
    elapsedMs: Date.now() - started,
  };
}

export const __testing = { applyGate, overallOf };
export type { CultureId };
