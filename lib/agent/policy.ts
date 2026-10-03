import { frictionState } from "../friction";
import { CULTURE_IDS, type CultureId, type CultureReading } from "../types";
import type { CandidateKind, VerifyOutcome } from "./types";

/**
 * エージェントの判断ルール。すべて決定的な純関数で、LLMに判断させない。
 * 何を検証し、いつ諦め、どこで人に渡すかが、キー無しでテストできる形になっている。
 */

/** 検証する文化圏の上限。コストと遅延を有界にするための上限 */
export const MAX_VERIFY = 2;

/**
 * これを超えたら検証を始めない。Vercel Hobby の maxDuration は60秒で、検証には最大18秒かかる。
 * 35 + 18 = 53秒で、報告を返す余裕を7秒残す。
 */
export const VERIFY_START_DEADLINE_MS = 35_000;

/** 1文化圏の検証（元の文と修正後の2回の読み）に許す時間 */
export const VERIFY_TIMEOUT_MS = 18_000;

export interface Candidate {
  kind: CandidateKind;
  /** 検証に使う投稿文（添え書きを付けた全文、または言い換え案） */
  text: string;
}

/**
 * 検証する修正案を選ぶ。
 * - 言い方のずれ：原文を一字も変えずに末尾へ添え書きを付けた全文（添え書きが無ければ言い換え案）
 * - 線引きのずれ・分類なし：言い換え案。添え書きは使わない（注釈では防げないため）
 * - 摩擦なし・未検査：検証しない
 * 修正案が無ければ null。
 */
export function candidateFor(input: string, reading: CultureReading): Candidate | null {
  const state = frictionState(reading);
  if (state === "clean" || state === "unjudged") return null;
  if (state === "wording" && reading.bridgeNote) {
    return { kind: "note", text: `${input}\n${reading.bridgeNote}` };
  }
  if (reading.rewrite) return { kind: "rewrite", text: reading.rewrite };
  return null;
}

export interface VerifyTarget {
  culture: CultureId;
  candidate: Candidate;
}

/**
 * 検証する文化圏を選ぶ。修正案があるもののうち risk の高い順に最大 max 件。
 * 同点は文化圏の並び順（CULTURE_IDS）で決め、実行のたびに結果が揺れないようにする。
 */
export function pickVerifyTargets(
  input: string,
  readings: readonly CultureReading[],
  max: number = MAX_VERIFY,
): VerifyTarget[] {
  return readings
    .flatMap((r): { r: CultureReading; candidate: Candidate }[] => {
      const candidate = candidateFor(input, r);
      return candidate ? [{ r, candidate }] : [];
    })
    .sort(
      (a, b) =>
        b.r.risk - a.r.risk || CULTURE_IDS.indexOf(a.r.culture) - CULTURE_IDS.indexOf(b.r.culture),
    )
    .slice(0, Math.max(0, max))
    .map(({ r, candidate }) => ({ culture: r.culture, candidate }));
}

/** 検証を始めてよいか。経過が予算以上なら始めない（途中で60秒を超えて何も返せなくなるのを避ける） */
export function canStartVerify(elapsedMs: number): boolean {
  return elapsedMs < VERIFY_START_DEADLINE_MS;
}

/**
 * 人に渡す文化圏。線引きのずれ（行為・題材の線引き）は、言い方を直しても残るので
 * エージェントは自動で決めず、⑥で止まって発信者に選んでもらう。
 */
export function handoffCultures(readings: readonly CultureReading[]): CultureId[] {
  return CULTURE_IDS.filter((id) => {
    const r = readings.find((x) => x.culture === id);
    return r ? frictionState(r) === "boundary" : false;
  });
}

/** 検証の結果、リスクが下がったか。検証できていないものには適用しない（呼び出し側が verified だけに使う） */
export function improved(outcome: VerifyOutcome): boolean {
  return outcome.after.risk < outcome.before.risk;
}
