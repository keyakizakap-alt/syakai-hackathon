/**
 * 処理ごとに使うモデルを解決するレジストリ。
 *
 * 全処理（panel/gate/filter）はOpenRouter一本に統一されている。panel（核となる
 * 文化規範判定）はOpenRouter経由でも同じ`anthropic/claude-sonnet-5`を使うため
 * 判定品質への影響はない。gate（逆翻訳の機械的な採点）とfilter（タグ写像）は
 * 安価なモデルを既定にしてコストを下げる。処理ごとに環境変数でモデルを
 * 個別に上書きできる。
 */

export type TaskName = "panel" | "gate" | "filter" | "verify";
export type ReasoningEffort = "low" | "medium" | "high";

const TASK_DEFAULTS: Record<TaskName, string> = {
  panel: "anthropic/claude-sonnet-5",
  gate: "google/gemini-2.5-flash",
  filter: "google/gemini-2.5-flash",
  // エージェントの自己検証。**生成（panel）と別ベンダー**にする。同じモデルが自分の修正案を
  // 採点すると甘くなりうるため。品質は未検証で、NUANCE_MODEL_VERIFY で差し替えられる。
  verify: "openai/gpt-5.1",
};

const TASK_ENV: Record<TaskName, string> = {
  panel: "NUANCE_MODEL_PANEL",
  gate: "NUANCE_MODEL_GATE",
  filter: "NUANCE_MODEL_FILTER",
  verify: "NUANCE_MODEL_VERIFY",
};

/**
 * panel は深い推論を使う。gate/filter は機械的な処理のため指定しない。
 * verify は読み直しの確認なので panel より軽くし、時間予算（60秒）に収める。
 */
const REASONING_EFFORT: Partial<Record<TaskName, ReasoningEffort>> = { panel: "high", verify: "medium" };

/**
 * 1つ目のモデルが拒否/レート制限/障害で失敗した場合の候補（最大3件）。
 * 同一ベンダーのモデルは同じ理由で連鎖的に拒否しうるため、異なるベンダーを混ぜる。
 * 実在確認済み（OpenRouterのモデルページで確認）。
 */
const TASK_FALLBACKS: Partial<Record<TaskName, string[]>> = {
  panel: ["openai/gpt-5.1", "google/gemini-3.1-pro-preview"],
  // verify の候補に panel のモデル（生成側）は入れない。入れると障害時に自己採点へ戻ってしまう
  verify: ["google/gemini-3.1-pro-preview"],
};

export interface ResolvedModel {
  model: string;
  fallbackModels?: string[];
  reasoningEffort?: ReasoningEffort;
}

/** 処理名から、その処理で使うモデルとリクエストパラメータを解決する */
export function resolveModel(task: TaskName): ResolvedModel {
  return {
    model: process.env[TASK_ENV[task]] || TASK_DEFAULTS[task],
    fallbackModels: TASK_FALLBACKS[task],
    reasoningEffort: REASONING_EFFORT[task],
  };
}
