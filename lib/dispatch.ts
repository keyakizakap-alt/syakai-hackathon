import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";

import { assertNoRefusal, getClient, hasCredentials } from "./claude";
import { resolveModel, type TaskName } from "./models";
import { hasOpenRouterCredentials, runOpenRouter } from "./openrouter";

/**
 * その処理が実際に解決されるプロバイダの認証情報を持っているか。
 *
 * app/api の各ルートはこれで demo/live を切り替える。gate/filter の既定は
 * OpenRouter のため、ANTHROPIC_API_KEY だけ見ていた旧来のチェックのままだと、
 * OpenRouter のキーが無いのに「認証情報あり」と誤判定して 503 を返してしまう
 * （デモモードへ正しくフォールバックできない）。
 */
export function hasCredentialsFor(task: TaskName): boolean {
  const { provider } = resolveModel(task);
  return provider === "openrouter" ? hasOpenRouterCredentials() : hasCredentials();
}

/**
 * 処理名（panel/gate/filter）ごとに解決されたプロバイダへ、構造化出力付きで
 * 1回のリクエストを投げる共通口。プロバイダ分岐はここに一箇所だけ持たせる。
 */
export async function complete<T>(
  task: TaskName,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const resolved = resolveModel(task);

  if (resolved.provider === "openrouter") {
    return runOpenRouter({ model: resolved.model, system, user, schema });
  }

  const client = getClient();
  const res = await client.beta.messages.parse({
    model: resolved.model,
    max_tokens: 16000,
    betas: resolved.betas,
    ...(resolved.fallbacks && { fallbacks: resolved.fallbacks }),
    ...(resolved.thinking && { thinking: resolved.thinking }),
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema) },
  });
  assertNoRefusal(res);
  if (!res.parsed_output) throw new Error(`${task} の構造化出力を取得できませんでした`);
  return res.parsed_output;
}
