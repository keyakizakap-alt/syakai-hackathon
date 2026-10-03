import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CHECK_CASES, type CheckCase } from "../eval/cases.check";
import { aggregateCheck, scoreCheckCase } from "../eval/score";
import { NORM_CARDS } from "../lib/norms";
import type { CheckResult, CultureId, CultureReading } from "../lib/types";

function reading(culture: CultureId, over: Partial<CultureReading> = {}): CultureReading {
  return { culture, verdict: "green", risk: 5, reading: "", triggers: [], rewrite: null, ...over };
}

function result(cultures: CultureReading[]): CheckResult {
  return { input: "x", overall: "green", glossaryHits: [], cultures, backTranslations: [], mode: "live", elapsedMs: 0 };
}

const CASE: CheckCase = {
  id: "t-1",
  category: "pragmatic_inversion",
  text: "x",
  why: "",
  expect: { minVerdict: { en_ao3: "yellow" }, mustCiteNorm: { en_ao3: [2, 12] } },
};

describe("根拠の的中率（規範カードの番号）", () => {
  test("期待した番号のどれか1つを挙げていれば的中（any-of）", () => {
    const s = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [12] })]));
    assert.equal(s.citations[0].hit, true);
    assert.deepEqual(s.citations[0].expectedAny, [2, 12]);
  });

  test("期待と無関係な番号だけなら外れ", () => {
    const s = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [7, 9] })]));
    assert.equal(s.citations[0].hit, false);
  });

  test("根拠を挙げなかった（未指定・空）なら外れ。挙げなかったことを的中扱いにしない", () => {
    assert.equal(scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80 })])).citations[0].hit, false);
    assert.equal(
      scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [] })])).citations[0].hit,
      false,
    );
  });

  test("根拠の的中は合否（passed）を変えない。既存の合格率と比べられる状態を保つ", () => {
    const hit = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [2] })]));
    const miss = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [9] })]));
    assert.equal(hit.passed, true);
    assert.equal(miss.passed, true, "番号が外れても、verdict が基準を満たしていれば合格のまま");
  });

  test("mustCiteNorm を持たないケースは citations が空", () => {
    const c: CheckCase = { ...CASE, expect: { minVerdict: { en_ao3: "yellow" } } };
    assert.deepEqual(scoreCheckCase(c, result([reading("en_ao3", { verdict: "red", risk: 80 })])).citations, []);
  });

  test("集計は（文化圏×ケース）単位で数える", () => {
    const hit = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [2] })]));
    const miss = scoreCheckCase(CASE, result([reading("en_ao3", { verdict: "red", risk: 80, normRefs: [9] })]));
    const agg = aggregateCheck([hit, miss]);
    assert.equal(agg.citeTotal, 2);
    assert.equal(agg.citeHit, 1);
  });
});

describe("評価ケースの期待番号が、実在する規範を指している", () => {
  test("mustCiteNorm の番号はすべて範囲内（規範を並べ替えて静かにずれるのを防ぐ）", () => {
    let count = 0;
    for (const c of CHECK_CASES) {
      for (const [culture, nos] of Object.entries(c.expect.mustCiteNorm ?? {})) {
        for (const no of nos ?? []) {
          count++;
          assert.ok(
            no >= 1 && no <= NORM_CARDS[culture as CultureId].length,
            `${c.id}/${culture} の期待番号 #${no} が範囲外`,
          );
        }
      }
    }
    assert.ok(count > 0, "期待番号が1件も無い（評価が空になっている）");
  });

  test("期待番号が指す規範は、そのケースの文面と関係している（アンカー）", () => {
    // 番号だけを見ても意味が分からないので、本文の語を突き合わせて、取り違えを検知する
    const expectations: [id: string, culture: CultureId, no: number, mustContain: string][] = [
      ["pol-01", "en_ao3", 4, "I died"],
      ["prag-01", "en_ao3", 2, "wrong"],
      ["warn-01", "en_ao3", 1, "警告"],
      ["div-02", "jp_doujin", 11, "中の人"],
      ["div-04", "kr_fancafe", 1, "敬"],
      ["div-05", "jp_doujin", 10, "定価"],
      ["div-01", "kr_fancafe", 7, "会計"],
      ["div-01", "en_ao3", 11, "有償"],
    ];
    for (const [id, culture, no, word] of expectations) {
      const c = CHECK_CASES.find((x) => x.id === id);
      assert.ok(c, `${id} が無い`);
      assert.ok(c.expect.mustCiteNorm?.[culture]?.includes(no), `${id}/${culture} は #${no} を期待しているはず`);
      assert.ok(NORM_CARDS[culture][no - 1].text.includes(word), `${culture} #${no} に「${word}」が無い`);
    }
  });
});
