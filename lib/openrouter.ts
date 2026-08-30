import OpenAI from "openai";
import * as z from "zod/v4";

import { NoCredentialsError, RefusalError } from "./errors";

/**
 * OpenRouter経由の呼び出し。全処理（panel/gate/filter）がこの一本を通る。
 *
 * OpenRouterはOpenAI互換のAPIでClaude・Gemini・GPT等を含む多数のモデルを
 * 1つのAPIキーで呼び出せるプロキシ。環境変数にOpenRouter上の任意のモデルIDを
 * 指定するだけで、コード変更なしにモデルを切り替えられる。
 */

export function hasOpenRouterCredentials(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function getOpenRouterClient(): OpenAI {
  if (!hasOpenRouterCredentials()) throw new NoCredentialsError("OPENROUTER_API_KEY");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export async function runOpenRouter<T>(args: {
  model: string;
  /** 1つ目のモデルが拒否/レート制限/障害で失敗した場合に順に試す候補（最大3件） */
  fallbackModels?: string[];
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** 深い推論が必要な処理（panel）だけ effort を指定する */
  reasoningEffort?: "low" | "medium" | "high" | "max";
}): Promise<T> {
  const client = getOpenRouterClient();
  // models・reasoning は OpenRouter 独自の拡張フィールドで openai 公式パッケージの型には無いため、
  // ここだけ型を緩めたリクエストボディを組み立てる。
  type OpenRouterExtra = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    models?: string[];
    reasoning?: { effort: string };
  };
  const body: OpenRouterExtra = {
    model: args.model,
    ...(args.fallbackModels && { models: args.fallbackModels }),
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    ...(args.reasoningEffort && { reasoning: { effort: args.reasoningEffort } }),
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema: z.toJSONSchema(args.schema) },
    },
  };
  const completion = await client.chat.completions.create(body);

  const choice = completion.choices[0];
  const text = choice?.message?.content;
  if (completion.model !== args.model) {
    console.warn(`[openrouter] フォールバックが発火: ${args.model} → ${completion.model}`);
  }

  // OpenRouterは元プロバイダの終了理由を native_finish_reason で透過的に返す
  // （openai公式パッケージの型には無い拡張フィールドのため as で参照する）。
  const nativeFinishReason = (choice as { native_finish_reason?: string } | undefined)?.native_finish_reason;
  if (nativeFinishReason === "refusal") {
    throw new RefusalError("openrouter", completion.model);
  }
  if (!text) throw new Error(`OpenRouter（${args.model}）から応答テキストを取得できませんでした`);
  return args.schema.parse(JSON.parse(text));
}
