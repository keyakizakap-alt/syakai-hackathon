import type { CultureReading, Verdict } from "./types";

/** 4文化のうち最もリスクが高いものを、結果サマリの代表として使う */
export function worstCulture(cultures: CultureReading[]): CultureReading | null {
  if (cultures.length === 0) return null;
  return cultures.reduce((worst, c) => (c.risk > worst.risk ? c : worst), cultures[0]);
}

/** サーバー側の採点基準（green 0-25 / yellow 26-65 / red 66-100）と揃えたラベル */
export function riskLabel(score: number): { label: string; verdict: Verdict } {
  if (score <= 25) return { label: "低", verdict: "green" };
  if (score <= 65) return { label: "中", verdict: "yellow" };
  return { label: "高", verdict: "red" };
}
