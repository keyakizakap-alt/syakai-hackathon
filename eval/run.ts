/**
 * 評価ランナー。
 *
 *   npx tsx eval/run.ts              ベースラインのみ（APIキー不要）
 *   npx tsx eval/run.ts --live       ベースライン＋実モデル（OPENROUTER_API_KEY が必要）
 *   npx tsx eval/run.ts --live --out docs/BENCHMARK.md   結果をMarkdownで書き出す
 *
 * 設計上の要点：ベースラインは実モデルと同じゴールドセット・同じ採点関数を通す。
 * 別々の基準で測ると比較にならないため、差分だけが手法の差になるようにしてある。
 */

import { writeFileSync } from "node:fs";

import { CHECK_CASES, CONTROL_CASES, POLARITY_CASES } from "./cases.check";
import { FILTER_CASES } from "./cases.filter";
import { baselineFilter, baselineGlossary, type BaselineName } from "./baseline";
import {
  aggregateCheck,
  aggregateFilter,
  pct,
  scoreCheckCase,
  scoreFilterCase,
  type CheckScore,
  type FilterAggregate,
  type FilterScore,
} from "./score";
import type { FilterDecision } from "../lib/types";

const args = new Set(process.argv.slice(2));
const LIVE = args.has("--live");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx >= 0 ? process.argv[outIdx + 1] : null;

const lines: string[] = [];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

// ── 1. 入国審査：ベースライン ────────────────────────────────

function runFilterBaseline(mode: BaselineName): FilterAggregate {
  const scores = FILTER_CASES.map((c) => scoreFilterCase(c, baselineFilter(c.declaration, mode)));
  return aggregateFilter(FILTER_CASES, scores);
}

function filterRow(label: string, a: FilterAggregate): string {
  return `| ${label} | ${pct(a.falseNegativeRate)} | ${pct(a.falsePositiveRate)} | ${a.semanticCaught}/${a.semanticTotal}（${pct(a.semanticRecall)}） |`;
}

// ── 2. 出国審査：辞書ベースラインの被覆率 ─────────────────────

function runGlossaryCoverage() {
  const rows = CHECK_CASES.map((c) => ({
    id: c.id,
    category: c.category,
    ...baselineGlossary(c.text),
  }));
  const nonControl = rows.filter((r) => r.category !== "control");
  const noSignal = nonControl.filter((r) => !r.hasSignal);
  const controlFalseAlarm = rows.filter((r) => r.category === "control" && r.hasSignal);
  return { rows, nonControl, noSignal, controlFalseAlarm };
}

// ── 3. 実モデル評価 ───────────────────────────────────────────

async function runLive() {
  const { analyze } = await import("../lib/analyze");
  const { runFilter } = await import("../lib/filter");

  say("### 実モデル：出国審査");
  say();
  const checkScores: CheckScore[] = [];
  for (const c of CHECK_CASES) {
    try {
      const result = await analyze(c.text);
      const s = scoreCheckCase(c, result);
      checkScores.push(s);
      say(`- ${s.passed ? "PASS" : "FAIL"} \`${c.id}\` (${c.category}) ${s.passed ? "" : JSON.stringify({
        under: s.underSeverity, over: s.overWarned, div: s.missedDivergence, spans: s.missedSpans,
      })}`);
    } catch (err) {
      say(`- ERROR \`${c.id}\`: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const agg = aggregateCheck(checkScores);
  say();
  say(`合計 ${agg.passed}/${agg.total}（${pct(agg.passed / agg.total)}）`);
  say();
  say("| カテゴリ | 合格 |");
  say("|---|---|");
  for (const [cat, v] of Object.entries(agg.byCategory)) {
    say(`| ${cat} | ${v.passed}/${v.total}（${pct(v.passed / v.total)}） |`);
  }
  say();
  say(`過剰警告（対照群を green と判定できなかった）: ${agg.controlOverWarned}/${agg.controlTotal}`);
  say();

  say("### 実モデル：入国審査");
  say();
  const filterScores: FilterScore[] = [];
  for (const c of FILTER_CASES) {
    try {
      const res = await runFilter(c.declaration);
      const decisions = new Map<string, FilterDecision>(res.verdicts.map((v) => [v.workId, v.decision]));
      const s = scoreFilterCase(c, decisions);
      filterScores.push(s);
      say(
        `- \`${c.id}\` 偽陰性:${s.falseNegatives.length} 偽陽性:${s.falsePositives.length} ` +
          `意味理解のみ:${s.semanticHits.length}/${(c.semanticOnly ?? []).length}`,
      );
    } catch (err) {
      say(`- ERROR \`${c.id}\`: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (filterScores.length > 0) {
    const fa = aggregateFilter(
      FILTER_CASES.filter((c) => filterScores.some((s) => s.caseId === c.id)),
      filterScores,
    );
    say();
    say(filterRow("**ニュアンス税関（実モデル）**", fa));
  }
  say();
}

// ── main ────────────────────────────────────────────────────

async function main() {
  say("# ベンチマーク結果");
  say();
  say(`実行日時: ${new Date().toISOString()}`);
  say(`ケース数: 出国審査 ${CHECK_CASES.length}件（うち対照群 ${CONTROL_CASES.length}件） / 入国審査 ${FILTER_CASES.length}件`);
  say();

  // 入国審査の比較表
  say("## 入国審査：手法の比較");
  say();
  say("偽陰性（遮断すべきものを通す）が実害。偽陽性（過剰遮断）は解除すれば読めるため実害が小さい。");
  say("この非対称性ゆえに1つの正答率にまとめず、独立に測る。");
  say();
  say("| 手法 | 偽陰性率 ↓ | 過剰遮断率 | 単語一致では不可能な項目の捕捉 |");
  say("|---|---|---|---|");
  const tagOnly = runFilterBaseline("tag_only");
  const tagSummary = runFilterBaseline("tag_and_summary");
  say(filterRow("タグ一致のみ（既存のタグブロック相当）", tagOnly));
  say(filterRow("タグ＋あらすじ全文検索（強めのベースライン）", tagSummary));
  if (!LIVE) {
    say("| **ニュアンス税関（実モデル）** | 未計測 | 未計測 | 未計測 |");
  }
  say();

  // 辞書ベースラインの被覆
  const g = runGlossaryCoverage();
  say("## 出国審査：辞書だけで届く範囲");
  say();
  say(
    `用語集（${35}語）の完全一致で信号が得られたのは、対照群を除く ${g.nonControl.length}件中 ` +
      `${g.nonControl.length - g.noSignal.length}件。` +
      `残り **${g.noSignal.length}件は辞書に一度もヒットせず、規則ベースでは判定の手がかりがゼロ**になる。`,
  );
  say();
  say("辞書にヒットしないケース:");
  say();
  for (const r of g.noSignal) {
    const c = CHECK_CASES.find((x) => x.id === r.id)!;
    say(`- \`${r.id}\` (${r.category}) 「${c.text.slice(0, 30)}${c.text.length > 30 ? "…" : ""}」`);
  }
  say();
  say(
    `対照群 ${CONTROL_CASES.length}件のうち ${g.controlFalseAlarm.length}件が辞書にヒットする` +
      `（＝辞書だけでは無害な文にも反応しうる）。`,
  );
  say();
  say(
    `なお極性反転ケース ${POLARITY_CASES.length}件は、辞書がヒットしても` +
      `**「肯定として読む」判断そのものは辞書に書けない**（「無理」は文脈次第で本当に否定）。`,
  );
  say();

  if (LIVE) {
    say("## 実モデルの評価");
    say();
    await runLive();
  } else {
    say("## 実モデルの評価");
    say();
    say("`OPENROUTER_API_KEY` を設定して `npm run eval:live` を実行すると計測される。");
    say();
  }

  if (OUT) {
    writeFileSync(OUT, lines.join("\n") + "\n", "utf-8");
    console.log(`\n→ ${OUT} に書き出しました`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
