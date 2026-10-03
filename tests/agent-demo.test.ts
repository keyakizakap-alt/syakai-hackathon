import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { demoAgentScript, replayDemo } from "../lib/agent/demo";
import { MAX_VERIFY, handoffCultures, pickVerifyTargets } from "../lib/agent/policy";
import { STEP_IDS, type AgentEvent, type AgentResult } from "../lib/agent/types";
import { demoResult, PRESETS } from "../lib/demo";
import { cleanNormRefs, frictionOf, frictionState, normalizeBridgeNote } from "../lib/friction";
import { riskLabel } from "../lib/summary";
import type { CultureReading } from "../lib/types";

/** プリセットごとの脚本を取り出す。無ければテストを失敗させる */
function script(presetText: string) {
  const s = demoAgentScript(presetText);
  assert.ok(s, `プリセットのデモ脚本が無い: ${presetText.slice(0, 20)}`);
  return s;
}

function resultOf(presetText: string): AgentResult {
  const last = script(presetText).at(-1)?.event;
  assert.equal(last?.type, "result", "最後のイベントは result");
  return (last as Extract<AgentEvent, { type: "result" }>).result;
}

describe("デモ再生：実行していない結果を、実行したかのように見せない", () => {
  test("全プリセットに脚本があり、plan で始まり result で終わる", () => {
    assert.ok(PRESETS.length > 0);
    for (const p of PRESETS) {
      const s = script(p.text);
      const first = s[0].event;
      assert.equal(first.type, "plan");
      assert.equal(first.type === "plan" && first.mode, "demo", "デモ再生であることを明示する");
      assert.equal(s.at(-1)?.event.type, "result");
    }
  });

  test("所要時間（ms）を出さない（計測していない数値になるため）", () => {
    for (const p of PRESETS) {
      for (const { event } of script(p.text)) {
        if (event.type === "step" || event.type === "lane") {
          assert.equal(event.ms, undefined, `デモに ms が入っている: ${JSON.stringify(event)}`);
        }
      }
    }
  });

  test("ツール呼び出し回数は 0、経過時間は無し、モードは demo", () => {
    for (const p of PRESETS) {
      const r = resultOf(p.text);
      assert.equal(r.agent.mode, "demo");
      assert.equal(r.agent.toolCalls, 0, "実行していないので回数を主張しない");
      assert.equal(r.agent.elapsedMs, undefined);
      assert.equal(r.mode, "demo");
    }
  });

  test("全手順が running を経て、running のまま終わらない", () => {
    for (const p of PRESETS) {
      const steps = script(p.text)
        .map((t) => t.event)
        .filter((e): e is Extract<AgentEvent, { type: "step" }> => e.type === "step");
      for (const id of STEP_IDS) {
        const seq = steps.filter((e) => e.id === id).map((e) => e.status);
        assert.equal(seq[0], "running", `${id} は running から始まる`);
        assert.notEqual(seq.at(-1), "running", `${id} が running のまま終わっている`);
      }
    }
  });

  test("プリセット以外には脚本を作らない", () => {
    assert.equal(demoAgentScript("任意の文章"), null);
  });
});

describe("デモの手書きデータが、判断ルールと規範本文に整合している", () => {
  test("根拠の番号はすべて実在し、green 以外のすべての文化圏に根拠がある", () => {
    for (const p of PRESETS) {
      const result = demoResult(p.text);
      assert.ok(result);
      for (const c of result.cultures) {
        assert.deepEqual(cleanNormRefs(c.normRefs, c.culture), c.normRefs ?? [], `${p.id}/${c.culture} に不正な番号`);
        if (c.verdict !== "green") {
          assert.ok((c.normRefs?.length ?? 0) > 0, `${p.id}/${c.culture} は摩擦があるのに根拠が無い`);
        }
      }
    }
  });

  test("添え書きは『green 以外の言い方のずれ』にだけ付き、すでに正規化済みである", () => {
    for (const p of PRESETS) {
      const result = demoResult(p.text);
      assert.ok(result);
      for (const c of result.cultures) {
        if (!c.bridgeNote) continue;
        assert.notEqual(c.verdict, "green", `${p.id}/${c.culture}: green に添え書き`);
        assert.equal(frictionState(c), "wording", `${p.id}/${c.culture}: 言い方以外に添え書き`);
        assert.equal(
          normalizeBridgeNote(c.bridgeNote, frictionOf(c)),
          c.bridgeNote,
          `${p.id}/${c.culture}: 正規化で変わる（制御文字・長さ）`,
        );
      }
    }
  });

  test("検証対象は policy が選んだものと一致する（ルールを変えたら手書きの値が足りなくなって落ちる）", () => {
    for (const p of PRESETS) {
      const result = demoResult(p.text);
      assert.ok(result);
      const expected = pickVerifyTargets(p.text, result.cultures).map((t) => t.culture);
      const actual = resultOf(p.text).agent.verified.map((v) => v.culture);
      assert.deepEqual(actual, expected, `${p.id}`);
      assert.ok(actual.length <= MAX_VERIFY);
    }
  });

  test("検証の verdict は risk から導いた値と一致する", () => {
    for (const p of PRESETS) {
      for (const v of resultOf(p.text).agent.verified) {
        assert.equal(v.before.verdict, riskLabel(v.before.risk).verdict);
        assert.equal(v.after.verdict, riskLabel(v.after.risk).verdict);
      }
    }
  });

  test("検証した修正案は、言い方なら『原文＋添え書き』、線引きなら言い換え案である", () => {
    for (const p of PRESETS) {
      const result = demoResult(p.text);
      assert.ok(result);
      for (const v of resultOf(p.text).agent.verified) {
        const c: CultureReading = result.cultures.find((x) => x.culture === v.culture)!;
        if (v.candidate === "note") {
          assert.equal(v.revisedText, `${p.text}\n${c.bridgeNote}`);
          assert.ok(v.revisedText.startsWith(p.text), "原文を一字も変えていない");
        } else {
          assert.equal(v.revisedText, c.rewrite);
          // 言い方のずれで添え書きがあるなら、検証すべきは言い換え案ではなく添え書き付きの全文
          assert.ok(
            !(frictionState(c) === "wording" && c.bridgeNote),
            `${p.id}/${c.culture}: 添え書きがあるのに言い換え案を検証している`,
          );
        }
      }
    }
  });

  test("人への引き渡しは policy と一致し、⑥の状態にも反映される", () => {
    for (const p of PRESETS) {
      const result = demoResult(p.text);
      assert.ok(result);
      const r = resultOf(p.text);
      assert.deepEqual(r.agent.handoff, handoffCultures(result.cultures));
      const report = script(p.text)
        .map((t) => t.event)
        .filter((e): e is Extract<AgentEvent, { type: "step" }> => e.type === "step" && e.id === "report")
        .at(-1);
      assert.equal(report?.status, r.agent.handoff.length > 0 ? "waiting" : "done");
    }
  });

  test("4つのプリセットが、見せたい筋書きどおりの結果になる", () => {
    const byId = Object.fromEntries(PRESETS.map((p) => [p.id, resultOf(p.text)]));
    // 熱量の誤訳＝言い方のずれ。添え書きで橋渡しでき、人に渡すものは無い
    assert.deepEqual(byId.polarity.agent.handoff, []);
    // 会計・集金＝行為の線引き。4文化すべてが人の判断に渡る
    assert.deepEqual(byId.accountability.agent.handoff, ["jp_doujin", "en_ao3", "kr_fancafe", "zh_weibo"]);
    // 解釈違い＝EN/KR は言い方、CN は「どこで言うか」の線引き
    assert.deepEqual(byId.interpretation.agent.handoff, ["zh_weibo"]);
    // 警告の越境失効＝全部、題材を明記する添え書きで足りる
    assert.deepEqual(byId.warning.agent.handoff, []);
  });
});

describe("replayDemo：時間差の再生", () => {
  test("脚本の順序どおりに全イベントを流し、遅延を挟む", async () => {
    const [preset] = PRESETS;
    const s = script(preset.text);
    const got: AgentEvent[] = [];
    const waits: number[] = [];
    await replayDemo(s, (e) => got.push(e), async (ms) => void waits.push(ms));
    assert.deepEqual(got, s.map((t) => t.event));
    assert.equal(
      waits.reduce((a, b) => a + b, 0),
      s.reduce((a, t) => a + t.delayMs, 0),
    );
  });
});
