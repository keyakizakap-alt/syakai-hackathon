import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { __testing } from "../lib/analyze";
import {
  citedNorms,
  cleanNormRefs,
  frictionFields,
  frictionOf,
  frictionState,
  normalizeBridgeNote,
  summarizeFriction,
} from "../lib/friction";
import { NORM_CARDS } from "../lib/norms";
import { CULTURE_IDS, type CultureReading } from "../lib/types";

const { unjudgedCultureReading } = __testing;

function reading(over: Partial<CultureReading> = {}): CultureReading {
  return {
    culture: "en_ao3",
    verdict: "yellow",
    risk: 50,
    reading: "",
    triggers: [],
    rewrite: null,
    ...over,
  };
}

describe("規範カードの整合", () => {
  test("各文化圏に12項目あり、すべて種別と本文を持つ", () => {
    for (const id of CULTURE_IDS) {
      assert.equal(NORM_CARDS[id].length, 12, `${id} は12項目のはず`);
      for (const [i, n] of NORM_CARDS[id].entries()) {
        assert.ok(n.text.length > 0, `${id} #${i + 1} の本文が空`);
        assert.ok(n.kind === "wording" || n.kind === "boundary", `${id} #${i + 1} の種別が不正`);
      }
    }
  });

  test("各文化圏に言い方と線引きの両方がある（片方だけだと分類の意味がない）", () => {
    for (const id of CULTURE_IDS) {
      const kinds = new Set(NORM_CARDS[id].map((n) => n.kind));
      assert.ok(kinds.has("wording") && kinds.has("boundary"), `${id} は両方の種別を持つべき`);
    }
  });

  /**
   * デモ（lib/demo.ts）と評価ケース（eval/cases.check.ts）は規範を「番号」で参照する。
   * 規範を挿入・並べ替えるとそれらが別の規範を指したまま静かにずれるので、
   * 参照されている番号の本文の冒頭をここで固定して、ずれたら落とす。
   */
  test("番号で参照している規範が、意図した項目を指している（アンカー）", () => {
    const anchors: [(typeof CULTURE_IDS)[number], number, string][] = [
      ["jp_doujin", 7, "課金額"],
      ["jp_doujin", 10, "定価超えの転売"],
      ["jp_doujin", 11, "「中の人」"],
      ["en_ao3", 1, "無タグ・無警告"],
      ["en_ao3", 2, '"wrong"'],
      ["en_ao3", 4, '"I died"'],
      ["en_ao3", 11, "有償二次創作"],
      ["kr_fancafe", 1, "敬語階層"],
      ["kr_fancafe", 7, "誕生日広告"],
    ];
    for (const [culture, no, startsWith] of anchors) {
      const text = NORM_CARDS[culture][no - 1].text;
      assert.ok(text.startsWith(startsWith), `${culture} #${no} が想定と違う: ${text.slice(0, 20)}`);
    }
  });
});

describe("cleanNormRefs：モデルが返した番号を実在するものだけにする", () => {
  test("範囲外・0・負数・小数を捨てる", () => {
    assert.deepEqual(cleanNormRefs([0, 13, -1, 2.5, 4], "en_ao3"), [4]);
  });

  test("重複を捨て、モデルが返した順（最も効いた規範が先）を保つ", () => {
    assert.deepEqual(cleanNormRefs([4, 2, 4, 2], "en_ao3"), [4, 2]);
  });

  test("最大3件に絞る（多いほど何でも当てはまることになり根拠にならない）", () => {
    assert.deepEqual(cleanNormRefs([1, 2, 3, 4, 5], "jp_doujin"), [1, 2, 3]);
  });

  test("未指定・空はそのまま空", () => {
    assert.deepEqual(cleanNormRefs(undefined, "jp_doujin"), []);
    assert.deepEqual(cleanNormRefs([], "jp_doujin"), []);
  });

  test("NaN や Infinity が混ざっても壊れない", () => {
    assert.deepEqual(cleanNormRefs([Number.NaN, Number.POSITIVE_INFINITY, 3], "kr_fancafe"), [3]);
  });
});

describe("citedNorms / frictionOf：種別は静的な分類から決定的に導く", () => {
  test("本文と種別を引き当てる", () => {
    const [n] = citedNorms({ culture: "jp_doujin", normRefs: [10] });
    assert.equal(n.no, 10);
    assert.equal(n.kind, "boundary");
    assert.match(n.text, /定価超え/);
  });

  test("保存済みデータに範囲外の番号が入っていても、ここで再検証して落とす", () => {
    assert.deepEqual(citedNorms({ culture: "jp_doujin", normRefs: [99] }), []);
  });

  test("全て言い方なら言い方", () => {
    // en #2 と #4 はどちらも言い方
    assert.equal(frictionOf({ culture: "en_ao3", normRefs: [2, 4] }), "wording");
  });

  test("1つでも線引きがあれば線引き（言い方を直しても残るため）", () => {
    // en #4（言い方）に #11（線引き）が混ざる
    assert.equal(frictionOf({ culture: "en_ao3", normRefs: [4, 11] }), "boundary");
  });

  test("根拠が引けなければ null（分類を捏造しない）", () => {
    assert.equal(frictionOf({ culture: "en_ao3", normRefs: [] }), null);
    assert.equal(frictionOf({ culture: "en_ao3" }), null);
  });
});

describe("normalizeBridgeNote：添え書きは言い方のずれにだけ出す", () => {
  test("線引き・種別なしでは捨てる（注釈で防げないものに橋渡しできると見せない）", () => {
    assert.equal(normalizeBridgeNote("(※ note)", "boundary"), null);
    assert.equal(normalizeBridgeNote("(※ note)", null), null);
  });

  test("言い方なら残し、前後の空白を落とす", () => {
    assert.equal(normalizeBridgeNote("  (※ note)  ", "wording"), "(※ note)");
  });

  test("空・null・空白だけは null", () => {
    assert.equal(normalizeBridgeNote("", "wording"), null);
    assert.equal(normalizeBridgeNote("   ", "wording"), null);
    assert.equal(normalizeBridgeNote(null, "wording"), null);
    assert.equal(normalizeBridgeNote(undefined, "wording"), null);
  });

  test("利用者がコピーして貼るので、不可視・双方向制御文字を除去する", () => {
    const attack = "(※ ok‮​‬)";
    const out = normalizeBridgeNote(attack, "wording") ?? "";
    for (const ch of ["‮", "​", "‬"]) {
      assert.ok(!out.includes(ch), `U+${ch.codePointAt(0)!.toString(16)} が残っている`);
    }
    assert.ok(out.includes("ok"), "可視部分は保持される");
  });

  test("ZWJ と絵文字は壊さない", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    assert.equal(normalizeBridgeNote(`(※ ${family} \u{1F480})`, "wording"), `(※ ${family} \u{1F480})`);
  });

  test("200文字で切る。サロゲートペア（💀）の途中で切って化けさせない", () => {
    const skull = "\u{1F480}";
    const out = normalizeBridgeNote("a".repeat(199) + skull + "bbb", "wording") ?? "";
    assert.equal([...out].length, 200, "code point で200");
    assert.ok(out.endsWith(skull), "絵文字が壊れず末尾に残る");
    assert.ok(!out.includes("�"), "文字化けの置換文字が出ていない");
  });
});

describe("frictionFields：モデル出力の取り込み", () => {
  test("green には添え書きを付けない（直す必要がないものに橋渡しを提案しない）", () => {
    const f = frictionFields("en_ao3", "green", { norm_refs: [2], bridge_note: "(※ note)" });
    assert.equal(f.bridgeNote, null);
    assert.deepEqual(f.normRefs, [2], "根拠の番号自体は保持する");
  });

  test("green 以外の言い方では添え書きを残す", () => {
    const f = frictionFields("en_ao3", "red", { norm_refs: [4], bridge_note: "(※ 'died' is praise)" });
    assert.equal(f.bridgeNote, "(※ 'died' is praise)");
  });

  test("線引きでは、モデルが添え書きを書いても捨てる", () => {
    const f = frictionFields("kr_fancafe", "red", { norm_refs: [7], bridge_note: "(※ trust us)" });
    assert.equal(f.bridgeNote, null);
  });

  test("根拠が引けない（範囲外だけ）なら添え書きも出さない", () => {
    const f = frictionFields("en_ao3", "red", { norm_refs: [99], bridge_note: "(※ note)" });
    assert.deepEqual(f.normRefs, []);
    assert.equal(f.bridgeNote, null);
  });
});

describe("frictionState：未検査を『摩擦なし』と取り違えない", () => {
  test("判定を取得できなかった文化圏は unjudged（clean にならない）", () => {
    for (const id of CULTURE_IDS) {
      assert.equal(frictionState(unjudgedCultureReading(id)), "unjudged");
    }
  });

  test("green は clean。根拠を引いていても摩擦とは数えない", () => {
    assert.equal(frictionState(reading({ verdict: "green", risk: 5, normRefs: [4] })), "clean");
  });

  test("green 以外は根拠の種別になる", () => {
    assert.equal(frictionState(reading({ normRefs: [4] })), "wording");
    assert.equal(frictionState(reading({ culture: "kr_fancafe", normRefs: [7] })), "boundary");
  });

  test("green 以外で根拠が引けなければ unclassified（逆翻訳ゲートで昇格した等）", () => {
    assert.equal(frictionState(reading({ normRefs: [] })), "unclassified");
    assert.equal(frictionState(reading()), "unclassified");
  });

  test("summarizeFriction は状態ごとに数える", () => {
    const s = summarizeFriction([
      reading({ normRefs: [4] }),
      reading({ culture: "kr_fancafe", normRefs: [7] }),
      reading({ verdict: "green", risk: 3 }),
      unjudgedCultureReading("zh_weibo"),
    ]);
    assert.deepEqual(s, { wording: 1, boundary: 1, clean: 1, unjudged: 1, unclassified: 0 });
  });
});
