import type { CheckCase } from "./cases.check";
import type { FilterCase } from "./cases.filter";
import type { CheckResult, CultureId, FilterDecision, Verdict } from "../lib/types";

/** 純粋な採点関数。実行系から切り離してあるためユニットテストできる。 */

const RANK: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };

// ── 入国審査（受信フィルタ）の採点 ──────────────────────────────

export interface FilterScore {
  caseId: string;
  /** 遮断すべきものを通した作品ID（重大な失敗） */
  falseNegatives: string[];
  /** 通すべきものを遮断した作品ID（過剰遮断） */
  falsePositives: string[];
  /** 単語一致では到達不能な作品のうち、遮断できたもの */
  semanticHits: string[];
  /** 同じく、取りこぼしたもの */
  semanticMisses: string[];
}

export function scoreFilterCase(c: FilterCase, decisions: Map<string, FilterDecision>): FilterScore {
  const decisionOf = (id: string) => decisions.get(id);

  const falseNegatives = c.mustBlock.filter((id) => decisionOf(id) !== "block");
  const falsePositives = c.mustPass.filter((id) => decisionOf(id) === "block");

  const semantic = c.semanticOnly ?? [];
  const semanticHits = semantic.filter((id) => decisionOf(id) === "block");
  const semanticMisses = semantic.filter((id) => decisionOf(id) !== "block");

  return { caseId: c.id, falseNegatives, falsePositives, semanticHits, semanticMisses };
}

export interface FilterAggregate {
  cases: number;
  /** 遮断すべき総数と、実際に遮断できた数 */
  mustBlockTotal: number;
  mustBlockCaught: number;
  /** 通すべき総数と、誤って遮断した数 */
  mustPassTotal: number;
  falsePositiveCount: number;
  /** 単語一致では不可能な項目の総数と、捕捉数 */
  semanticTotal: number;
  semanticCaught: number;
  /** 偽陰性率。このプロダクトで最も重要な指標（低いほど良い） */
  falseNegativeRate: number;
  /** 過剰遮断率（低いほど良いが、偽陰性より優先度は低い） */
  falsePositiveRate: number;
  /** 意味理解でしか到達できない項目の捕捉率 */
  semanticRecall: number;
}

export function aggregateFilter(cases: FilterCase[], scores: FilterScore[]): FilterAggregate {
  const byId = new Map(scores.map((s) => [s.caseId, s]));

  let mustBlockTotal = 0;
  let mustBlockCaught = 0;
  let mustPassTotal = 0;
  let falsePositiveCount = 0;
  let semanticTotal = 0;
  let semanticCaught = 0;

  for (const c of cases) {
    const s = byId.get(c.id);
    if (!s) continue;
    mustBlockTotal += c.mustBlock.length;
    mustBlockCaught += c.mustBlock.length - s.falseNegatives.length;
    mustPassTotal += c.mustPass.length;
    falsePositiveCount += s.falsePositives.length;
    semanticTotal += (c.semanticOnly ?? []).length;
    semanticCaught += s.semanticHits.length;
  }

  const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);

  return {
    cases: cases.length,
    mustBlockTotal,
    mustBlockCaught,
    mustPassTotal,
    falsePositiveCount,
    semanticTotal,
    semanticCaught,
    falseNegativeRate: ratio(mustBlockTotal - mustBlockCaught, mustBlockTotal),
    falsePositiveRate: ratio(falsePositiveCount, mustPassTotal),
    semanticRecall: ratio(semanticCaught, semanticTotal),
  };
}

// ── 出国審査の採点 ──────────────────────────────────────────

export interface CheckScore {
  caseId: string;
  category: CheckCase["category"];
  /** 期待した下限verdictを満たさなかった文化 */
  underSeverity: { culture: CultureId; expected: Verdict; actual: Verdict }[];
  /** control なのに green でなかった文化（＝過剰警告） */
  overWarned: { culture: CultureId; actual: Verdict }[];
  /** 割れるべきなのに割れなかった組 */
  missedDivergence: [CultureId, CultureId][];
  /** 検出されるべきなのに trigger に現れなかった span */
  missedSpans: string[];
  passed: boolean;
}

export function scoreCheckCase(c: CheckCase, result: CheckResult): CheckScore {
  const byCulture = new Map(result.cultures.map((r) => [r.culture, r]));
  const verdictOf = (id: CultureId): Verdict => byCulture.get(id)?.verdict ?? "green";

  const underSeverity: CheckScore["underSeverity"] = [];
  for (const [culture, expected] of Object.entries(c.expect.minVerdict ?? {})) {
    const actual = verdictOf(culture as CultureId);
    if (RANK[actual] < RANK[expected as Verdict]) {
      underSeverity.push({ culture: culture as CultureId, expected: expected as Verdict, actual });
    }
  }

  const overWarned: CheckScore["overWarned"] = [];
  if (c.expect.allGreen) {
    for (const r of result.cultures) {
      if (r.verdict !== "green") overWarned.push({ culture: r.culture, actual: r.verdict });
    }
  }

  const missedDivergence = (c.expect.mustDiverge ?? []).filter(
    ([a, b]) => verdictOf(a) === verdictOf(b),
  );

  const allSpans = result.cultures.flatMap((r) => r.triggers.map((t) => t.span));
  const missedSpans = (c.expect.mustFlagSpans ?? []).filter(
    (span) => !allSpans.some((s) => s.includes(span) || span.includes(s)),
  );

  return {
    caseId: c.id,
    category: c.category,
    underSeverity,
    overWarned,
    missedDivergence,
    missedSpans,
    passed:
      underSeverity.length === 0 &&
      overWarned.length === 0 &&
      missedDivergence.length === 0 &&
      missedSpans.length === 0,
  };
}

export interface CheckAggregate {
  total: number;
  passed: number;
  /** カテゴリ別の合格率 */
  byCategory: Record<string, { total: number; passed: number }>;
  /** 対照群のうち過剰警告したケース数（偽陽性） */
  controlOverWarned: number;
  controlTotal: number;
}

export function aggregateCheck(scores: CheckScore[]): CheckAggregate {
  const byCategory: CheckAggregate["byCategory"] = {};
  let passed = 0;
  let controlOverWarned = 0;
  let controlTotal = 0;

  for (const s of scores) {
    byCategory[s.category] ??= { total: 0, passed: 0 };
    byCategory[s.category].total++;
    if (s.passed) {
      byCategory[s.category].passed++;
      passed++;
    }
    if (s.category === "control") {
      controlTotal++;
      if (s.overWarned.length > 0) controlOverWarned++;
    }
  }

  return { total: scores.length, passed, byCategory, controlOverWarned, controlTotal };
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
