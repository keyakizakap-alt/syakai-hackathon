/**
 * 処理ごとに使うプロバイダ・モデルを解決するレジストリ。
 *
 * panel（核となる文化規範判定）は精度優先でAnthropicに固定。
 * gate（逆翻訳の機械的な採点）と filter（タグ写像）は panel と並列/毎回実行
 * されるため、既定プロバイダを OpenRouter（安価なモデルを1つのAPIキーで
 * 呼び出せるプロキシ）にしてコストを下げる。処理ごとに環境変数で
 * プロバイダ・モデルの両方を個別に上書きできる。
 *
 * Claude Opus 5 / Fable 5 は adaptive thinking と server-side fallback
 * (betas + fallbacks:"default") に対応するが、Haiku 4.5 のような旧世代の
 * パラメータ体系のモデルは adaptive thinking 自体に対応していない。
 * 単純にモデル名だけ差し替えると壊れるため、モデルごとの挙動差をここに集約する。
 * OpenRouter側はOpenAI互換の単純なリクエスト形式のみなので、この差異は無い。
 */

export type TaskName = "panel" | "gate" | "filter";
export type Provider = "anthropic" | "openrouter";

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
 * レジストリに無い Anthropic モデルIDが env で指定された場合のフォールバック。
 * thinking省略・fallback無しが最も互換性の高い安全側の既定値。
 * 新しいモデルを正式サポートするには MODEL_REGISTRY に追記する。
 */
const DEFAULT_CONFIG: ModelConfig = { supportsServerFallback: false };

interface TaskDefault {
  provider: Provider;
  model: string;
}

/** 基本モデルは Claude Sonnet 5。gate/filter は OpenRouter 経由の安価なモデルを既定にする */
const TASK_DEFAULTS: Record<TaskName, TaskDefault> = {
  panel: { provider: "anthropic", model: "claude-sonnet-5" },
  gate: { provider: "openrouter", model: "google/gemini-2.5-flash" },
  filter: { provider: "openrouter", model: "google/gemini-2.5-flash" },
};

/** provider だけを上書きし model 指定が無い場合に使う、プロバイダごとの既定モデル */
const DEFAULT_MODEL_FOR_PROVIDER: Record<Provider, string> = {
  anthropic: "claude-sonnet-5",
  openrouter: "google/gemini-2.5-flash",
};

const TASK_MODEL_ENV: Record<TaskName, string> = {
  panel: "NUANCE_MODEL_PANEL",
  gate: "NUANCE_MODEL_GATE",
  filter: "NUANCE_MODEL_FILTER",
};

const TASK_PROVIDER_ENV: Record<TaskName, string> = {
  panel: "NUANCE_PROVIDER_PANEL",
  gate: "NUANCE_PROVIDER_GATE",
  filter: "NUANCE_PROVIDER_FILTER",
};

export interface ResolvedModel {
  provider: Provider;
  model: string;
  /** anthropic のときのみ意味を持つ */
  thinking?: ModelConfig["thinking"];
  betas: string[];
  fallbacks?: "default";
}

/** 処理名から、その処理で使うプロバイダ・モデルとリクエストパラメータを解決する */
export function resolveModel(task: TaskName): ResolvedModel {
  const def = TASK_DEFAULTS[task];
  const provider = (process.env[TASK_PROVIDER_ENV[task]] as Provider | undefined) || def.provider;
  // provider を既定から変更した場合、model の明示指定が無ければ「そのproviderの既定モデル」を使う
  const fallbackModel = provider === def.provider ? def.model : DEFAULT_MODEL_FOR_PROVIDER[provider];
  const model = process.env[TASK_MODEL_ENV[task]] || fallbackModel;

  if (provider === "openrouter") {
    return { provider, model, betas: [] };
  }

  const config = MODEL_REGISTRY[model] ?? DEFAULT_CONFIG;
  return {
    provider,
    model,
    thinking: config.thinking,
    betas: config.supportsServerFallback ? [FALLBACK_BETA] : [],
    fallbacks: config.supportsServerFallback ? "default" : undefined,
  };
}
