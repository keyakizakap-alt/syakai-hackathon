/**
 * 処理ごとに使うモデルを解決するレジストリ。
 *
 * Claude Opus 5 / Fable 5 は adaptive thinking と server-side fallback
 * (betas + fallbacks:"default") に対応するが、Haiku 4.5 のような旧世代の
 * パラメータ体系のモデルは adaptive thinking 自体に対応していない。
 * 単純にモデル名だけ差し替えると壊れるため、モデルごとの挙動差をここに集約する。
 */

export type TaskName = "panel" | "gate" | "filter";

interface ModelConfig {
  thinking?: { type: "adaptive" } | { type: "enabled"; budget_tokens: number };
  /** server-side fallback (betas + fallbacks:"default") は Opus 5 / Fable 5 系のみの機能 */
  supportsServerFallback: boolean;
}

/** Claude Opus 5 の refusal に対するサーバーサイド・フォールバック用ベータ */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  "claude-opus-5": { thinking: { type: "adaptive" }, supportsServerFallback: true },
  "claude-fable-5": { thinking: { type: "adaptive" }, supportsServerFallback: true },
  "claude-sonnet-5": { thinking: { type: "adaptive" }, supportsServerFallback: false },
  "claude-opus-4-8": { thinking: { type: "adaptive" }, supportsServerFallback: false },
  "claude-opus-4-7": { thinking: { type: "adaptive" }, supportsServerFallback: false },
  "claude-opus-4-6": { thinking: { type: "adaptive" }, supportsServerFallback: false },
  "claude-sonnet-4-6": { thinking: { type: "adaptive" }, supportsServerFallback: false },
  // Haiku 4.5 は adaptive thinking 非対応の旧世代パラメータ体系。thinking自体を省略する
  "claude-haiku-4-5": { supportsServerFallback: false },
};

/**
 * レジストリに無いモデルIDが env で指定された場合のフォールバック。
 * thinking省略・fallback無しが最も互換性の高い安全側の既定値。
 * 新しいモデルを正式サポートするには MODEL_REGISTRY に追記する。
 */
const DEFAULT_CONFIG: ModelConfig = { supportsServerFallback: false };

/**
 * 基本モデルは Claude Sonnet 5。核となる文化規範判定(panel)に使う。
 * gate（逆翻訳の機械的な採点）と filter（タグ写像）は panel と並列/毎回
 * 実行されるため、基本モデルより下の最安ティア Haiku 4.5 に振ってコストを削る。
 */
const TASK_DEFAULTS: Record<TaskName, string> = {
  panel: "claude-sonnet-5",
  gate: "claude-haiku-4-5",
  filter: "claude-haiku-4-5",
};

const TASK_ENV: Record<TaskName, string> = {
  panel: "NUANCE_MODEL_PANEL",
  gate: "NUANCE_MODEL_GATE",
  filter: "NUANCE_MODEL_FILTER",
};

export interface ResolvedModel {
  model: string;
  thinking?: ModelConfig["thinking"];
  betas: string[];
  fallbacks?: "default";
}

/** 処理名から、その処理で使うモデルとリクエストパラメータを解決する */
export function resolveModel(task: TaskName): ResolvedModel {
  const model = process.env[TASK_ENV[task]] || TASK_DEFAULTS[task];
  const config = MODEL_REGISTRY[model] ?? DEFAULT_CONFIG;
  return {
    model,
    thinking: config.thinking,
    betas: config.supportsServerFallback ? [FALLBACK_BETA] : [],
    fallbacks: config.supportsServerFallback ? "default" : undefined,
  };
}
