import type { AgentEvent } from "./types";

/**
 * エージェントのイベントを NDJSON（1行1イベントのJSON）で流すための読み書き。
 * 純関数・純クラスにしてあり、ネットワーク由来の壊れ方（チャンク境界で行が割れる等）をキー無しでテストできる。
 */

const EVENT_TYPES: ReadonlySet<string> = new Set(["plan", "step", "lane", "degrade", "result", "error"]);

export function encodeEvent(event: AgentEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * 1行を AgentEvent として読む。空行・壊れた行・未知の種類は null にして、ストリーム全体は止めない。
 * 途中で1行壊れただけで画面が固まるより、その行だけ捨てて続けるほうが利用者にとって安全。
 */
export function parseEvent(line: string): AgentEvent | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && EVENT_TYPES.has((value as { type?: string }).type ?? "")) {
      return value as AgentEvent;
    }
  } catch {
    // 壊れた行は捨てる
  }
  return null;
}

/**
 * チャンクの境界で行が割れても読めるデコーダ。
 * fetch のストリームは任意の位置でチャンクが切れるので、改行が来るまで貯めておく。
 */
export class NdjsonDecoder {
  private rest = "";

  push(chunk: string): AgentEvent[] {
    this.rest += chunk;
    const lines = this.rest.split("\n");
    // 最後の要素は改行がまだ来ていない書きかけの行なので、次のチャンクまで持ち越す
    this.rest = lines.pop() ?? "";
    return lines.flatMap((line) => {
      const event = parseEvent(line);
      return event ? [event] : [];
    });
  }

  /** ストリームの終端で、改行が付かないまま残った最後の行を読む */
  flush(): AgentEvent[] {
    const event = parseEvent(this.rest);
    this.rest = "";
    return event ? [event] : [];
  }
}
