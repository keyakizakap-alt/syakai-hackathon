import Anthropic from "@anthropic-ai/sdk";

// モデルID・thinking設定・fallback可否は処理ごとに lib/models.ts の resolveModel() で解決する。

export class NoCredentialsError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY が設定されていません");
    this.name = "NoCredentialsError";
  }
}

export class RefusalError extends Error {
  constructor(category: string | null) {
    super(`モデルが応答を拒否しました${category ? `（${category}）` : ""}`);
    this.name = "RefusalError";
  }
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getClient(): Anthropic {
  if (!hasCredentials()) throw new NoCredentialsError();
  return new Anthropic();
}

export function assertNoRefusal(res: { stop_reason: string | null; stop_details?: unknown }): void {
  if (res.stop_reason !== "refusal") return;
  const details = res.stop_details as { category?: string | null } | null | undefined;
  throw new RefusalError(details?.category ?? null);
}

/**
 * ユーザー入力をプロンプトに埋め込む前に無害化する。
 *
 * 入力は必ず XML 風タグで囲んで渡すが、ユーザーが閉じタグを書けると
 * そこでデータ領域を抜けてシステム指示を上書きできてしまう。
 * 山括弧を全角に置換して、タグとして解釈されないようにする。
 */
export function sanitizeForPrompt(text: string): string {
  return text.replace(/</g, "＜").replace(/>/g, "＞");
}

/** すべての実行時プロンプトに共通する、書き手を責めないためのトーン制約 */
export const TONE_RULE = `
あなたは検閲官ではなく通訳者である。どの文化を「正しい」とも判定せず、双方の前提の違いだけを述べよ。
説教・道徳的な指導・書き手を責める表現を使ってはならない。書き手が自分で判断できる材料だけを返す。`.trim();

/** 機械翻訳が最も頻繁に壊す極性反転クラスを、第一候補として検討させる */
export const POLARITY_GUARD = `
【極性ガード】「しんどい」「無理」「死ぬ」「やばい」「草」「awsl」「I'm dead」「💀」「泣いた」の類が
原文にある場合、文脈上ポジティブ（最上級の肯定）である可能性を必ず第一候補として検討せよ。
これらを疲労・拒絶・自傷・脅迫として読むのは、機械翻訳が最も頻繁に犯す誤りである。`.trim();
