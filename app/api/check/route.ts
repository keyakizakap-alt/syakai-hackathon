import { NextResponse } from "next/server";

import { analyze } from "@/lib/analyze";
import { guardRequest, readJsonBody, readTextField } from "@/lib/api-guard";
import { NoCredentialsError, RefusalError } from "@/lib/errors";
import { demoResult, PRESETS } from "@/lib/demo";
import { hasCredentialsFor } from "@/lib/dispatch";

export const runtime = "nodejs";
/** 4ペルソナ並列判定＋逆翻訳ゲートで時間がかかるため上限まで取る */
export const maxDuration = 60;

const MAX_CHARS = 600;

export async function POST(req: Request) {
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  const parsed = await readJsonBody(req);
  if ("error" in parsed) return parsed.error;

  const field = readTextField(parsed.body, "text", MAX_CHARS, "判定する文章を入力してください");
  if ("error" in field) return field.error;
  const text = field.value;

  // panel（核となる文化規範判定）が必要とする認証情報が無い環境では
  // プリセット例のみデモ応答を返す。ハッカソン当日にキーが使えない事態への保険も兼ねている。
  if (!hasCredentialsFor("panel")) {
    const demo = demoResult(text);
    if (demo) return NextResponse.json(demo);
    return NextResponse.json(
      {
        error:
          "デモモードで動作しています。任意の文章を判定するには API キーの設定が必要です。" +
          "デモモードではプリセット例のみ判定できます。",
        presets: PRESETS.map((p) => p.text),
      },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await analyze(text));
  } catch (err) {
    if (err instanceof NoCredentialsError) {
      return NextResponse.json({ error: "サーバー側の設定が不足しています" }, { status: 503 });
    }
    if (err instanceof RefusalError) {
      return NextResponse.json(
        { error: "この文章はモデルが判定を拒否しました。表現を変えてお試しください。" },
        { status: 422 },
      );
    }
    // 例外の中身（モデル名・リクエストURL・スタック等）はサーバーログにのみ残す。
    // クライアントへそのまま返すと内部構成の手がかりを与えてしまう。
    console.error("[check] 解析に失敗しました", err);
    return NextResponse.json({ error: "解析に失敗しました。しばらくしてからお試しください。" }, { status: 500 });
  }
}
