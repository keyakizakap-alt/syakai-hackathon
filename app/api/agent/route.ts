import { NextResponse } from "next/server";

import { demoAgentScript, replayDemo } from "@/lib/agent/demo";
import { liveDeps } from "@/lib/agent/live";
import { encodeEvent } from "@/lib/agent/ndjson";
import { classifyError, runFrictionAgent } from "@/lib/agent/run";
import type { AgentEvent } from "@/lib/agent/types";
import { guardRequest, readJsonBody, readTextField } from "@/lib/api-guard";
import { PRESETS } from "@/lib/demo";
import { hasCredentialsFor } from "@/lib/dispatch";

export const runtime = "nodejs";
/** 調査（panel と gate の並列）に加えて検証を行うため、上限まで取る。検証は35秒を超えたら始めない */
export const maxDuration = 60;

const MAX_CHARS = 600;

/**
 * キーがあるとき（＝実際に費用が掛かるとき）、1回の実行はレート制限上この回数分として数える。
 *
 * 1回の実行は LLM を最大6回呼ぶ（panel1＋gate1＋検証4）。/api/check の2回の約3倍で、
 * 1リクエスト＝1回分のままだと、悪意ある連打で費用が約3倍に膨らむ。
 * デモ再生は何も呼ばず費用が掛からないので、1回分のまま（審査員がプリセットを続けて試せるように）。
 */
const LIVE_RATE_COST = 3;

/**
 * 摩擦予防エージェントの実行。進捗を NDJSON（1行1イベント）で流す。
 *
 * /api/check は残してある（eval とクライアントのフォールバック用）。こちらはその上に
 * 「どう作業したか」を見せる層で、判定の中身は同じ analyze() を通る。
 */
export async function POST(req: Request) {
  const live = hasCredentialsFor("panel");
  // guardRequest は呼ぶたびに1回分を数える。共有の入口ガードを変えずに、重みを付ける
  for (let i = 0; i < (live ? LIVE_RATE_COST : 1); i++) {
    const blocked = guardRequest(req);
    if (blocked) return blocked;
  }

  const parsed = await readJsonBody(req);
  if ("error" in parsed) return parsed.error;

  const field = readTextField(parsed.body, "text", MAX_CHARS, "判定する文章を入力してください");
  if ("error" in field) return field.error;
  const text = field.value;

  // キー無しではプリセットだけデモ再生する。それ以外は /api/check と同じく 503
  const script = live ? null : demoAgentScript(text);
  if (!live && !script) {
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // クライアントが切断したら、以降は書き込まない（LLM 呼び出し自体は止められない）
      let open = true;
      req.signal.addEventListener("abort", () => {
        open = false;
      });
      const emit = (event: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };

      try {
        if (script) await replayDemo(script, emit);
        else await runFrictionAgent(text, liveDeps(), emit);
      } catch (err) {
        // runFrictionAgent は通常 error イベントで終わる。ここに来るのは想定外の例外だけ。
        // 内部の詳細はクライアントに出さず、サーバーログにだけ残す
        console.error("[agent] 想定外のエラー", err);
        emit({ type: "error", ...classifyError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // すでに閉じている
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // 中間のプロキシにバッファされると、手順が順に流れず最後にまとめて届いてしまう
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-store",
    },
  });
}
