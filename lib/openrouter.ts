import OpenAI from "openai";
import * as z from "zod/v4";

import { NoCredentialsError } from "./claude";

/**
 * OpenRouter経由の呼び出し。
 *
 * OpenRouterはOpenAI互換のAPIでGemini・Llama・DeepSeek等を含む多数のモデルを
 * 1つのAPIキーで呼び出せるプロキシ。これにより「NUANCE_MODEL_GATE」等の環境変数に
 * OpenRouter上の任意のモデルIDを指定するだけで、コード変更なしにモデルを切り替えられる。
 *
 * refusal相当の統一的なレスポンスフィールドはOpenRouterには無い。非対応モデルや
 * スキーマ不正は通常のAPIエラーとして例外化されるため、ここでは素通しし、
 * 呼び出し元（app/api 配下の route.ts）の汎用エラーハンドリングに委ねる。
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
  system: string;
  user: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema: z.toJSONSchema(args.schema) },
    },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter（${args.model}）から応答テキストを取得できませんでした`);
  return args.schema.parse(JSON.parse(text));
}
