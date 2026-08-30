import { NextResponse } from "next/server";

import { guardRequest, readJsonBody, readTextField } from "@/lib/api-guard";
import { NoCredentialsError, RefusalError } from "@/lib/errors";
import { demoFilterResult, FILTER_PRESETS } from "@/lib/demo-filter";
import { hasCredentialsFor } from "@/lib/dispatch";
import { runFilter } from "@/lib/filter";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 400;

export async function POST(req: Request) {
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  const parsed = await readJsonBody(req);
  if ("error" in parsed) return parsed.error;

  const field = readTextField(parsed.body, "declaration", MAX_CHARS, "見たくないものを書いてください");
  if ("error" in field) return field.error;
  const declaration = field.value;

  if (!hasCredentialsFor("filter")) {
    const demo = demoFilterResult(declaration);
    if (demo) return NextResponse.json(demo);
    return NextResponse.json(
      {
        error:
          "デモモードで動作しています。任意の宣言でフィルタするには API キーの設定が必要です。",
        presets: FILTER_PRESETS.map((p) => p.text),
      },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await runFilter(declaration));
  } catch (err) {
    if (err instanceof NoCredentialsError) {
      return NextResponse.json({ error: "サーバー側の設定が不足しています" }, { status: 503 });
    }
    if (err instanceof RefusalError) {
      return NextResponse.json(
        { error: "この宣言はモデルが判定を拒否しました。表現を変えてお試しください。" },
        { status: 422 },
      );
    }
    // 例外の中身はサーバーログにのみ残す（内部構成の漏洩を防ぐ）
    console.error("[filter] フィルタに失敗しました", err);
    return NextResponse.json({ error: "フィルタに失敗しました。しばらくしてからお試しください。" }, { status: 500 });
  }
}
