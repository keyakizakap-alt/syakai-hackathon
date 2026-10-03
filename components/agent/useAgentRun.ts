"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { NdjsonDecoder } from "@/lib/agent/ndjson";
import { initialState, reduce, type AgentViewState } from "@/lib/agent/reducer";

/**
 * /api/agent のストリームを読み、画面状態（reducer）に流し込む。
 * 通信まわりの副作用はここに閉じ込め、状態の畳み込みは純関数の reducer に任せている。
 */
export function useAgentRun() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const abortRef = useRef<AbortController | null>(null);

  // 画面を離れるとき、読みかけのストリームを閉じる
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start" });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      // 入力エラー・レート制限・デモ非対応の入力などは、ストリームではなく JSON で返る
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        dispatch({ type: "error", code: "failed", message: data.error ?? "解析に失敗しました" });
        return;
      }

      const reader = res.body.getReader();
      const text8 = new TextDecoder();
      const lines = new NdjsonDecoder();
      let terminal = false;
      const feed = (events: ReturnType<NdjsonDecoder["push"]>) => {
        for (const event of events) {
          dispatch(event);
          if (event.type === "result" || event.type === "error") terminal = true;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true で、マルチバイト文字がチャンクの境目で割れても壊れない
        feed(lines.push(text8.decode(value, { stream: true })));
      }
      feed(lines.flush());

      // result も error も来ないまま終わった（通信断・サーバーの中断）。固まって見せない
      if (!terminal) dispatch({ type: "connection_lost" });
    } catch {
      if (controller.signal.aborted) return;
      dispatch({ type: "connection_lost" });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { state, run, reset };
}

/** 実行中の経過秒。デモ再生では使わない（計測値ではないため） */
export function useElapsedMs(running: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    setMs(0);
    const id = setInterval(() => setMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}

export type { AgentViewState };
