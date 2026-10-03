import type { Verdict } from "@/lib/types";

/** 所要時間の表示。計測していない（undefined）ときは何も出さない */
export function formatMs(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** 判定の信号色。エージェント自体の装飾（accent）とは混ぜない */
export const VERDICT_COLOR: Record<Verdict, string> = {
  green: "var(--color-green)",
  yellow: "var(--color-yellow)",
  red: "var(--color-red)",
};
