import type * as z from "zod/v4";

import { resolveModel, type TaskName } from "./models";
import { hasOpenRouterCredentials, runOpenRouter } from "./openrouter";

/**
 * その処理が実際に解決されるプロバイダ（現状はOpenRouterのみ）の認証情報を
 * 持っているか。app/api の各ルートはこれで demo/live を切り替える。
 */
export function hasCredentialsFor(_task: TaskName): boolean {
  return hasOpenRouterCredentials();
}

/**
 * 処理名（panel/gate/filter）ごとに解決されたモデルへ、構造化出力付きで
 * 1回のリクエストを投げる共通口。
 */
export async function complete<T>(
  task: TaskName,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const { model, fallbackModels, reasoningEffort } = resolveModel(task);
  return runOpenRouter({ model, fallbackModels, system, user, schema, reasoningEffort });
}
