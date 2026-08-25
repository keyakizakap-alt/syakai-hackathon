import { NextResponse } from "next/server";

import { analyze, hasCredentials, NoCredentialsError, RefusalError } from "@/lib/analyze";
import { demoResult, PRESETS } from "@/lib/demo";

export const runtime = "nodejs";
/** 4ペルソナ並列判定＋逆翻訳ゲートで時間がかかるため長めに取る */
export const maxDuration = 120;

const MAX_CHARS = 600;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが JSON ではありません" }, { status: 400 });
  }

  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "判定する文章を入力してください" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `文字数の上限は ${MAX_CHARS} 文字です（現在 ${text.length} 文字）` },
      { status: 400 },
    );
  }

  // APIキーがない環境ではプリセット例のみデモ応答を返す。
  // ハッカソン当日にキーが使えない事態への保険も兼ねている。
  if (!hasCredentials()) {
    const demo = demoResult(text);
    if (demo) return NextResponse.json(demo);
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY が未設定のためデモモードで動作しています。" +
          "任意の文章を判定するには API キーを設定してください。デモモードではプリセット例のみ判定できます。",
        presets: PRESETS.map((p) => p.text),
      },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await analyze(text));
  } catch (err) {
    if (err instanceof NoCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[check] 解析に失敗しました", err);
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: `解析に失敗しました: ${message}` }, { status: 500 });
  }
}
