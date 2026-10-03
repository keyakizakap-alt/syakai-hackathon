import type { AnalyzeHooks } from "../analyze";
import { NoCredentialsError, RefusalError } from "../errors";
import { frictionState, summarizeFriction, type FrictionSummary } from "../friction";
import { CULTURES, type CheckResult, type CultureId, type CultureReading } from "../types";
import { canStartVerify, handoffCultures, pickVerifyTargets, VERIFY_TIMEOUT_MS } from "./policy";
import {
  STEP_IDS,
  type AgentErrorCode,
  type AgentEvent,
  type AgentReport,
  type SkipReason,
  type StepId,
  type StepStatus,
  type VerifyOutcome,
  type VerifySkip,
} from "./types";

/**
 * 摩擦予防エージェント本体。
 *
 *   ①観測 → ②調査 → ③診断 → ④処方 → ⑤検証 → ⑥報告
 *
 * 外部への副作用は一切ない（投稿・削除・通報をしない）。できるのは助言まで。
 * 副作用がある操作を持たないので、LLM が誤った判断をしても被害は「画面に出る助言が外れる」までに留まる。
 *
 * 依存は deps として注入する。deps を差し替えれば、キー無しで次の判断をテストできる：
 * 検証が失敗・時間切れのとき改善を主張しない／線引きがあれば⑥で止まる／調査が全滅したらエラー。
 */

export interface AgentDeps {
  /** ①②（用語集・panel・gate）。フックで進捗を観測できる */
  analyze: (input: string, hooks: AnalyzeHooks) => Promise<CheckResult>;
  /** 指定した投稿文を、指定した1文化圏で読み直す（⑤）。検証モデルで読む */
  verify: (text: string, culture: CultureId) => Promise<CultureReading>;
  now: () => number;
  /** 設定上の検証モデル名（画面に出す） */
  verifier: string;
  verifyEnabled: boolean;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timeout ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** 時間内に終わらなければ reject する。下の処理は止まらない（キャンセル手段が無い）が、待たない */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 例外を、利用者に見せてよい文言へ変換する。モデル名・URL・スタックは見せない（詳細はサーバーログだけ）。
 * 文言は /api/check と揃えている。
 */
export function classifyError(err: unknown): { code: AgentErrorCode; message: string } {
  if (err instanceof NoCredentialsError) {
    return { code: "no_credentials", message: "サーバー側の設定が不足しています" };
  }
  if (err instanceof RefusalError) {
    return { code: "refusal", message: "この文章はモデルが判定を拒否しました。表現を変えてお試しください。" };
  }
  return { code: "failed", message: "解析に失敗しました。しばらくしてからお試しください。" };
}

function label(culture: CultureId): string {
  // 「JP 同人圏」→「JP」
  return CULTURES[culture].shortLabel.split(" ")[0];
}

/** ①の完了行。検出した語を先頭3つまで見せる */
export function observeLine(terms: readonly string[]): string {
  if (terms.length === 0) return "既知のファンダム語彙は検出なし";
  return `${terms.length}語を検出：${terms
    .slice(0, 3)
    .map((t) => `「${t}」`)
    .join("")}`;
}

export function riskLine(cultures: readonly CultureReading[]): string {
  return cultures
    .map((c) => (c.unjudged ? `${label(c.culture)} 未検査` : `${label(c.culture)} ${c.risk}`))
    .join(" ／ ");
}

export function diagnoseLine(s: FrictionSummary): string {
  const parts: string[] = [];
  if (s.wording) parts.push(`言い方 ${s.wording}`);
  if (s.boundary) parts.push(`線引き ${s.boundary}`);
  if (s.unclassified) parts.push(`分類なし ${s.unclassified}`);
  if (s.unjudged) parts.push(`未検査 ${s.unjudged}`);
  // 「安全」とは言わない。検出されなかっただけで、無いことの証明ではない
  return parts.length > 0 ? parts.join(" ／ ") : "摩擦のもとは検出されませんでした";
}

export function prescribeLine(cultures: readonly CultureReading[]): string {
  const states = cultures.map((c) => ({ c, state: frictionState(c) }));
  const notes = states.filter((x) => x.state === "wording" && x.c.bridgeNote).length;
  const choices = states.filter((x) => x.state === "boundary").length;
  const parts: string[] = [];
  if (notes) parts.push(`添え書き ${notes}件`);
  if (choices) parts.push(`選択肢 ${choices}件`);
  if (parts.length === 0) {
    const rewrites = states.filter((x) => x.state !== "clean" && x.state !== "unjudged" && x.c.rewrite).length;
    if (rewrites) parts.push(`言い換え案 ${rewrites}件`);
  }
  return parts.length > 0 ? parts.join(" ／ ") : "提案は不要";
}

/** ⑤の完了行。検証できた文化圏だけを書き、残りは未検証と明記する */
export function verifyLine(verified: readonly VerifyOutcome[], targetCount: number): string {
  const line = verified.map((v) => `${label(v.culture)} ${v.before.risk}→${v.after.risk}`).join(" ／ ");
  const rest = verified.length < targetCount ? "（残りは未検証）" : "";
  return `検証 ${verified.length}/${targetCount} 文化圏：${line}${rest}`;
}

/** ⑥の完了行 */
export function reportLine(handoff: readonly CultureId[]): string {
  return handoff.length > 0 ? `あなたの判断が必要：${handoff.map(label).join("・")}` : "要判断はありません";
}

export async function runFrictionAgent(
  input: string,
  deps: AgentDeps,
  emit: (event: AgentEvent) => void,
): Promise<void> {
  const t0 = deps.now();
  const elapsed = () => deps.now() - t0;
  const startedAt: Partial<Record<StepId, number>> = {};

  const begin = (id: StepId) => {
    startedAt[id] = deps.now();
    emit({ type: "step", id, status: "running" });
  };
  const finish = (id: StepId, status: StepStatus, detail?: string) => {
    emit({ type: "step", id, status, detail, ms: deps.now() - (startedAt[id] ?? t0) });
  };

  emit({ type: "plan", mode: "live", steps: [...STEP_IDS] });

  // ①② 観測と調査。進捗は analyze のフック経由で観測する。
  let observed = false;
  let degraded = false;
  const markObserved = (detail: string) => {
    if (observed) return;
    observed = true;
    finish("observe", "done", detail);
    begin("investigate");
  };

  begin("observe");
  let base: CheckResult;
  try {
    base = await deps.analyze(input, {
      onGlossary: (hits) => markObserved(observeLine(hits.map((h) => h.term))),
      onLane: (e) => emit({ type: "lane", ...e }),
      onDegrade: () => {
        degraded = true;
        emit({ type: "degrade", kind: "panel_split" });
      },
    });
  } catch (err) {
    // panel が全滅した場合。green で埋めて返さず、エラーとして止める（フェイルオープン禁止）
    console.error("[agent] 調査に失敗しました", err);
    if (!observed) markObserved("—");
    finish("investigate", "error");
    emit({ type: "error", ...classifyError(err) });
    return;
  }
  if (!observed) markObserved("—");
  finish("investigate", "done", riskLine(base.cultures));

  // ③ 診断。根拠の規範から摩擦の種類を導く（決定的）。
  begin("diagnose");
  finish("diagnose", "done", diagnoseLine(summarizeFriction(base.cultures)));

  // ④ 処方。添え書きは言い方にだけ、線引きは選択肢（⑥で人に渡す）。
  begin("prescribe");
  const targets = pickVerifyTargets(input, base.cultures);
  finish("prescribe", "done", prescribeLine(base.cultures));

  // ⑤ 検証。修正案を、別系統の検証モデルで「元の文」と「修正後」の両方を読んで比べる。
  begin("verify");
  const verified: VerifyOutcome[] = [];
  const skipped: VerifySkip[] = [];
  let verifyCalls = 0;
  const skipAll = (reason: SkipReason) => targets.forEach((t) => skipped.push({ culture: t.culture, reason }));

  if (targets.length === 0) {
    finish("verify", "skipped", "検証する修正案がありません");
  } else if (!deps.verifyEnabled) {
    skipAll("disabled");
    finish("verify", "skipped", "検証は無効化されています（未検証）");
  } else if (!canStartVerify(elapsed())) {
    skipAll("time_budget");
    finish("verify", "skipped", "経過時間が予算を超えたため省略しました（未検証）");
  } else {
    const settled = await Promise.allSettled(
      targets.map(async (t) => {
        verifyCalls += 2;
        const [b, a] = await withTimeout(
          Promise.all([deps.verify(input, t.culture), deps.verify(t.candidate.text, t.culture)]),
          VERIFY_TIMEOUT_MS,
        );
        return { t, b, a };
      }),
    );
    settled.forEach((s, i) => {
      const t = targets[i];
      if (s.status === "fulfilled") {
        verified.push({
          culture: t.culture,
          candidate: t.candidate.kind,
          revisedText: t.candidate.text,
          before: { verdict: s.value.b.verdict, risk: s.value.b.risk },
          after: { verdict: s.value.a.verdict, risk: s.value.a.risk },
        });
      } else {
        console.error(`[agent] ${t.culture} の検証に失敗しました`, s.reason);
        skipped.push({ culture: t.culture, reason: s.reason instanceof TimeoutError ? "timeout" : "error" });
      }
    });

    if (verified.length === 0) {
      // 検証に失敗した。After は出さない（改善を主張しない）
      finish("verify", "error", "検証できませんでした（未検証）");
    } else {
      finish("verify", "done", verifyLine(verified, targets.length));
    }
  }

  // ⑥ 報告。線引きのずれは自動で決めず、人の判断待ちで止まる。
  begin("report");
  const handoff = handoffCultures(base.cultures);
  const report: AgentReport = {
    mode: "live",
    // 用語集1 ＋ panel（縮退したときは統合1＋分割4）＋ gate1 ＋ 検証
    toolCalls: 1 + (degraded ? 5 : 1) + 1 + verifyCalls,
    elapsedMs: elapsed(),
    verifier: deps.verifier,
    verified,
    skipped,
    handoff,
    degraded,
  };
  finish("report", handoff.length > 0 ? "waiting" : "done", reportLine(handoff));
  emit({ type: "result", result: { ...base, agent: report } });
}
