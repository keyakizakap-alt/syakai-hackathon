import { NextResponse } from "next/server";

import { NoCredentialsError, RefusalError } from "@/lib/errors";
import { demoFilterResult, FILTER_PRESETS } from "@/lib/demo-filter";
import { hasCredentialsFor } from "@/lib/dispatch";
import { runFilter } from "@/lib/filter";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 400;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが JSON ではありません" }, { status: 400 });
  }

  const raw = (body as { declaration?: unknown })?.declaration;
  const declaration = typeof raw === "string" ? raw.trim() : "";

  if (!declaration) {
    return NextResponse.json({ error: "見たくないものを書いてください" }, { status: 400 });
  }
  if (declaration.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `文字数の上限は ${MAX_CHARS} 文字です（現在 ${declaration.length} 文字）` },
      { status: 400 },
    );
  }

  if (!hasCredentialsFor("filter")) {
    const demo = demoFilterResult(declaration);
    if (demo) return NextResponse.json(demo);
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY が未設定のためデモモードで動作しています。" +
          "任意の宣言でフィルタするには API キーを設定してください。",
        presets: FILTER_PRESETS.map((p) => p.text),
      },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await runFilter(declaration));
  } catch (err) {
    if (err instanceof NoCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[filter] フィルタに失敗しました", err);
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: `フィルタに失敗しました: ${message}` }, { status: 500 });
  }
}
