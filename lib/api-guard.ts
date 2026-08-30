import { NextResponse } from "next/server";

import { checkRateLimit, clientKeyOf } from "./rate-limit";

/**
 * APIルート共通の入口ガード。2つのルートが同じ検証を重複して持たないよう集約する。
 *
 * ここで守っているもの:
 * - Content-Type を application/json に限定する。ブラウザのフォームからは
 *   application/json を preflight 無しに送れないため、悪意あるサイトが訪問者の
 *   ブラウザに勝手にこのAPIを叩かせる（＝APIキーの残高を消費させる）
 *   クロスオリジンのフォーム送信を塞げる。
 * - 本文をパースする前にサイズを見る。巨大なJSONをメモリに展開させない。
 * - IPごとのレート制限。
 */

/** 本文の上限。判定対象は最大600文字なので、余裕を見てもこれで十分すぎる */
const MAX_BODY_BYTES = 16 * 1024;

/** 1IPあたり、この時間内に */
const RATE_WINDOW_MS = 60_000;
/** この回数まで。LLMを複数回呼ぶ重い処理なので低めに取る */
const RATE_LIMIT = 10;

/** ガードを通過できなかった場合に返すレスポンス。通過した場合は null */
export function guardRequest(req: Request): NextResponse | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type は application/json である必要があります" },
      { status: 415 },
    );
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "リクエストボディが大きすぎます" }, { status: 413 });
  }

  const { ok, retryAfterSec } = checkRateLimit(clientKeyOf(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!ok) {
    return NextResponse.json(
      { error: `リクエストが多すぎます。${retryAfterSec}秒後にもう一度お試しください。` },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  return null;
}

/**
 * 本文をJSONとして読む。Content-Length を持たないチャンク転送でも
 * 上限を超えないよう、読み出したバイト数でも打ち切る。
 */
export async function readJsonBody(req: Request): Promise<{ body: unknown } | { error: NextResponse }> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { error: NextResponse.json({ error: "リクエストボディを読み取れません" }, { status: 400 }) };
  }

  if (raw.length > MAX_BODY_BYTES) {
    return { error: NextResponse.json({ error: "リクエストボディが大きすぎます" }, { status: 413 }) };
  }

  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: NextResponse.json({ error: "リクエストボディが JSON ではありません" }, { status: 400 }) };
  }
}

/** 本文から文字列フィールドを取り出して長さを検証する */
export function readTextField(
  body: unknown,
  field: string,
  maxChars: number,
  emptyMessage: string,
): { value: string } | { error: NextResponse } {
  const raw = (body as Record<string, unknown> | null | undefined)?.[field];
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    return { error: NextResponse.json({ error: emptyMessage }, { status: 400 }) };
  }
  if (value.length > maxChars) {
    return {
      error: NextResponse.json(
        { error: `文字数の上限は ${maxChars} 文字です（現在 ${value.length} 文字）` },
        { status: 400 },
      ),
    };
  }
  return { value };
}
