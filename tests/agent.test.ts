import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AnalyzeHooks } from "../lib/analyze";
import { NoCredentialsError, RefusalError } from "../lib/errors";
import { NdjsonDecoder, encodeEvent, parseEvent } from "../lib/agent/ndjson";
import {
  MAX_VERIFY,
  VERIFY_START_DEADLINE_MS,
  candidateFor,
  canStartVerify,
  handoffCultures,
  pickVerifyTargets,
} from "../lib/agent/policy";
import { initialState, reduce, type AgentViewState } from "../lib/agent/reducer";
import { classifyError, runFrictionAgent, withTimeout, type AgentDeps } from "../lib/agent/run";
import { STEP_IDS, type AgentEvent, type AgentResult } from "../lib/agent/types";
import type { CheckResult, CultureId, CultureReading } from "../lib/types";

// ── 共通の部品 ─────────────────────────────────────────────

const INPUT = "新衣装かわいすぎて死んだ💀";

function reading(culture: CultureId, over: Partial<CultureReading> = {}): CultureReading {
  return { culture, verdict: "green", risk: 5, reading: "", triggers: [], rewrite: null, ...over };
}

/** en=言い方(#4)で添え書きあり、kr=線引き(#7)で言い換えあり、jp/zh=green */
function baseReadings(): CultureReading[] {
  return [
    reading("jp_doujin"),
    reading("en_ao3", { verdict: "red", risk: 88, normRefs: [4], bridgeNote: "(※ died = praise)", rewrite: "EN rewrite" }),
    reading("kr_fancafe", { verdict: "red", risk: 70, normRefs: [7], rewrite: "KR rewrite" }),
    reading("zh_weibo"),
  ];
}

function checkResult(cultures: CultureReading[]): CheckResult {
  return {
    input: INPUT,
    overall: "red",
    glossaryHits: [],
    cultures,
    backTranslations: [],
    mode: "live",
    elapsedMs: 0,
  };
}

interface Harness {
  deps: AgentDeps;
  events: AgentEvent[];
  verifyCalls: { text: string; culture: CultureId }[];
  setClock: (ms: number) => void;
}

/** 偽の deps。LLM を呼ばずに、エージェントの判断だけを検証できる */
function harness(opts: {
  cultures?: CultureReading[];
  analyzeError?: unknown;
  verify?: (text: string, culture: CultureId) => Promise<CultureReading>;
  verifyEnabled?: boolean;
  /** analyze が返るまでに進める時計（経過時間の予算を試すため） */
  analyzeTakes?: number;
}): Harness {
  let clock = 0;
  const events: AgentEvent[] = [];
  const verifyCalls: { text: string; culture: CultureId }[] = [];
  const cultures = opts.cultures ?? baseReadings();

  const deps: AgentDeps = {
    now: () => clock,
    verifier: "fake/verifier",
    verifyEnabled: opts.verifyEnabled ?? true,
    analyze: async (_input, hooks: AnalyzeHooks) => {
      hooks.onGlossary?.([]);
      hooks.onLane?.({ lane: "panel", phase: "start" });
      hooks.onLane?.({ lane: "gate", phase: "start" });
      clock += opts.analyzeTakes ?? 1000;
      if (opts.analyzeError) {
        hooks.onLane?.({ lane: "panel", phase: "end", ok: false, ms: 1000 });
        throw opts.analyzeError;
      }
      hooks.onLane?.({ lane: "panel", phase: "end", ok: true, ms: 1000 });
      hooks.onLane?.({ lane: "gate", phase: "end", ok: true, ms: 800 });
      return checkResult(cultures);
    },
    verify: async (text, culture) => {
      verifyCalls.push({ text, culture });
      if (opts.verify) return opts.verify(text, culture);
      // 既定：修正後（入力と違う文）は risk 20、元の文は 80 と読む
      return reading(culture, text === INPUT ? { verdict: "red", risk: 80 } : { verdict: "green", risk: 20 });
    },
  };
  return { deps, events, verifyCalls, setClock: (ms) => (clock = ms) };
}

async function run(h: Harness): Promise<AgentResult | undefined> {
  await runFrictionAgent(INPUT, h.deps, (e) => h.events.push(e));
  const last = h.events.find((e) => e.type === "result");
  return last?.type === "result" ? last.result : undefined;
}

const stepEvents = (events: AgentEvent[], id: string) =>
  events.filter((e): e is Extract<AgentEvent, { type: "step" }> => e.type === "step" && e.id === id);

// ── policy ─────────────────────────────────────────────────

describe("policy：何を検証し、どこで人に渡すか", () => {
  test("言い方のずれは、原文を一字も変えずに末尾へ添え書きを付けた全文を検証する", () => {
    const en = baseReadings()[1];
    const c = candidateFor(INPUT, en);
    assert.equal(c?.kind, "note");
    assert.equal(c?.text, `${INPUT}\n(※ died = praise)`);
    assert.ok(c!.text.startsWith(INPUT), "原文が変わっていない");
  });

  test("線引きのずれは言い換え案を検証する。添え書きは使わない", () => {
    const kr = baseReadings()[2];
    const c = candidateFor(INPUT, { ...kr, bridgeNote: "(※ should be ignored)" });
    assert.equal(c?.kind, "rewrite");
    assert.equal(c?.text, "KR rewrite");
  });

  test("摩擦なし・未検査は検証しない", () => {
    assert.equal(candidateFor(INPUT, reading("jp_doujin", { rewrite: "x" })), null);
    assert.equal(
      candidateFor(INPUT, reading("zh_weibo", { verdict: "yellow", unjudged: true, rewrite: "x" })),
      null,
    );
  });

  test("修正案が無ければ検証しない", () => {
    assert.equal(candidateFor(INPUT, reading("kr_fancafe", { verdict: "red", normRefs: [7] })), null);
  });

  test("risk の高い順に最大 MAX_VERIFY 件を選ぶ", () => {
    const rs = [
      reading("jp_doujin", { verdict: "yellow", risk: 30, normRefs: [7], rewrite: "a" }),
      reading("en_ao3", { verdict: "red", risk: 90, normRefs: [11], rewrite: "b" }),
      reading("kr_fancafe", { verdict: "red", risk: 70, normRefs: [7], rewrite: "c" }),
      reading("zh_weibo", { verdict: "red", risk: 60, normRefs: [1], rewrite: "d" }),
    ];
    const picked = pickVerifyTargets(INPUT, rs);
    assert.equal(picked.length, MAX_VERIFY);
    assert.deepEqual(
      picked.map((p) => p.culture),
      ["en_ao3", "kr_fancafe"],
    );
  });

  test("同点は文化圏の並び順で決まり、実行のたびに揺れない", () => {
    const rs = [
      reading("zh_weibo", { verdict: "red", risk: 70, normRefs: [1], rewrite: "z" }),
      reading("en_ao3", { verdict: "red", risk: 70, normRefs: [11], rewrite: "e" }),
      reading("kr_fancafe", { verdict: "red", risk: 70, normRefs: [7], rewrite: "k" }),
    ];
    assert.deepEqual(
      pickVerifyTargets(INPUT, rs).map((p) => p.culture),
      ["en_ao3", "kr_fancafe"],
    );
  });

  test("検証を始めてよいのは予算の手前まで", () => {
    assert.equal(canStartVerify(VERIFY_START_DEADLINE_MS - 1), true);
    assert.equal(canStartVerify(VERIFY_START_DEADLINE_MS), false);
  });

  test("人に渡すのは線引きのずれだけ", () => {
    assert.deepEqual(handoffCultures(baseReadings()), ["kr_fancafe"]);
    assert.deepEqual(handoffCultures([reading("en_ao3", { verdict: "red", normRefs: [4] })]), []);
  });
});

// ── run（偽の deps） ────────────────────────────────────────

describe("エージェント本体：判断の検証（LLM を呼ばない）", () => {
  test("6手順が順に流れ、最後に result が来る", async () => {
    const h = harness({});
    const result = await run(h);
    assert.ok(result, "result が返る");
    assert.equal(h.events[0].type, "plan");
    assert.equal(h.events.at(-1)?.type, "result");
    for (const id of STEP_IDS) {
      const last = stepEvents(h.events, id).at(-1);
      assert.ok(last, `${id} のイベントがある`);
      assert.notEqual(last.status, "running", `${id} が running のまま終わっていない`);
    }
  });

  test("線引きがあれば⑥で『人の判断待ち』として止まり、自動では決めない", async () => {
    const h = harness({});
    const result = await run(h);
    assert.equal(stepEvents(h.events, "report").at(-1)?.status, "waiting");
    assert.deepEqual(result?.agent.handoff, ["kr_fancafe"]);
  });

  test("線引きが無ければ⑥は done", async () => {
    const h = harness({
      cultures: [reading("jp_doujin"), reading("en_ao3", { verdict: "red", risk: 88, normRefs: [4], bridgeNote: "n" })],
    });
    await run(h);
    assert.equal(stepEvents(h.events, "report").at(-1)?.status, "done");
  });

  test("検証は『元の文』と『修正後』を同じ検証モデルで読み比べる", async () => {
    const h = harness({});
    const result = await run(h);
    const en = h.verifyCalls.filter((c) => c.culture === "en_ao3");
    assert.deepEqual(
      en.map((c) => c.text).sort(),
      [INPUT, `${INPUT}\n(※ died = praise)`].sort(),
      "元の文と修正後の2回読む",
    );
    const v = result?.agent.verified.find((x) => x.culture === "en_ao3");
    assert.equal(v?.before.risk, 80, "Before は panel の値(88)ではなく検証モデルが読んだ元の文");
    assert.equal(v?.after.risk, 20);
  });

  test("ツール呼び出し回数は実際の呼び出しを数える（用語集1＋panel1＋gate1＋検証2×2文化）", async () => {
    const result = await run(harness({}));
    assert.equal(result?.agent.toolCalls, 1 + 1 + 1 + 4);
  });

  test("検証が失敗した文化圏は After を出さない（改善を主張しない）", async () => {
    const h = harness({
      verify: async (_text, culture) => {
        if (culture === "en_ao3") throw new Error("verifier down");
        return reading(culture, { verdict: "green", risk: 10 });
      },
    });
    const result = await run(h);
    assert.ok(!result?.agent.verified.some((v) => v.culture === "en_ao3"), "失敗した文化圏は verified に入らない");
    assert.deepEqual(
      result?.agent.skipped.filter((s) => s.culture === "en_ao3").map((s) => s.reason),
      ["error"],
    );
  });

  test("検証が全て失敗したら⑤は error で、verified は空", async () => {
    const h = harness({
      verify: async () => {
        throw new Error("down");
      },
    });
    const result = await run(h);
    assert.equal(stepEvents(h.events, "verify").at(-1)?.status, "error");
    assert.deepEqual(result?.agent.verified, []);
  });

  test("経過時間が予算を超えたら検証を始めず、『未検証』として報告する", async () => {
    const h = harness({ analyzeTakes: VERIFY_START_DEADLINE_MS + 1 });
    const result = await run(h);
    assert.equal(h.verifyCalls.length, 0, "検証を呼んでいない");
    assert.equal(stepEvents(h.events, "verify").at(-1)?.status, "skipped");
    assert.deepEqual(result?.agent.verified, []);
    assert.ok(result?.agent.skipped.every((s) => s.reason === "time_budget"));
    assert.ok(result!.agent.skipped.length > 0, "検証しようとしていた文化圏が skipped に載る");
  });

  test("検証が無効なら呼ばず、未検証として報告する", async () => {
    const h = harness({ verifyEnabled: false });
    const result = await run(h);
    assert.equal(h.verifyCalls.length, 0);
    assert.ok(result?.agent.skipped.every((s) => s.reason === "disabled"));
  });

  test("検証する修正案が無ければ⑤は skipped", async () => {
    const h = harness({ cultures: [reading("jp_doujin"), reading("en_ao3")] });
    await run(h);
    assert.equal(stepEvents(h.events, "verify").at(-1)?.status, "skipped");
    assert.equal(h.verifyCalls.length, 0);
  });

  test("panel が全滅したら result を返さずエラー（green で埋めない）", async () => {
    const h = harness({ analyzeError: new Error("all down") });
    const result = await run(h);
    assert.equal(result, undefined, "result が出ない");
    const err = h.events.find((e) => e.type === "error");
    assert.equal(err?.type === "error" && err.code, "failed");
    assert.equal(stepEvents(h.events, "investigate").at(-1)?.status, "error");
  });

  test("エラー文言に内部情報（モデル名・URL・スタック）を出さない", async () => {
    const h = harness({ analyzeError: new Error("401 https://openrouter.ai/api/v1 sk-or-secret model=anthropic/claude") });
    await run(h);
    const err = h.events.find((e) => e.type === "error");
    const json = JSON.stringify(err);
    for (const leak of ["openrouter", "sk-or", "anthropic", "401"]) {
      assert.ok(!json.includes(leak), `${leak} が漏れている`);
    }
  });

  test("拒否と認証不足は専用のコードに分類する", () => {
    assert.equal(classifyError(new RefusalError("openrouter", "m")).code, "refusal");
    assert.equal(classifyError(new NoCredentialsError("K")).code, "no_credentials");
    assert.equal(classifyError(new Error("x")).code, "failed");
  });

  test("縮退運転（panel が文化ごとの分割に落ちた）を画面に伝え、呼び出し回数に反映する", async () => {
    const h = harness({});
    const original = h.deps.analyze;
    h.deps.analyze = async (input, hooks) => {
      hooks.onDegrade?.("panel_split");
      return original(input, hooks);
    };
    const result = await run(h);
    assert.ok(h.events.some((e) => e.type === "degrade"));
    assert.equal(result?.agent.degraded, true);
    assert.equal(result?.agent.toolCalls, 1 + 5 + 1 + 4);
  });

  test("withTimeout は時間内なら値を返し、超えたら reject する", async () => {
    assert.equal(await withTimeout(Promise.resolve(1), 50), 1);
    await assert.rejects(withTimeout(new Promise(() => {}), 10), /timeout/);
  });
});

// ── NDJSON ─────────────────────────────────────────────────

describe("NDJSON：ネットワーク由来の壊れ方", () => {
  const ev: AgentEvent = { type: "step", id: "observe", status: "done", detail: "3語を検出" };

  test("エンコードして1行で読み戻せる", () => {
    const line = encodeEvent(ev);
    assert.ok(line.endsWith("\n"));
    assert.equal(line.trim().split("\n").length, 1, "1イベント1行");
    assert.deepEqual(parseEvent(line), ev);
  });

  test("チャンクの途中で行が割れても読める", () => {
    const line = encodeEvent(ev) + encodeEvent({ type: "degrade", kind: "panel_split" });
    for (let cut = 1; cut < line.length; cut += 7) {
      const d = new NdjsonDecoder();
      const got = [...d.push(line.slice(0, cut)), ...d.push(line.slice(cut)), ...d.flush()];
      assert.equal(got.length, 2, `切れ目 ${cut} で2イベント読めるはず`);
    }
  });

  test("日本語・絵文字を含む行が、バイト境界ではなく文字列の境界で割れても壊れない", () => {
    const e: AgentEvent = { type: "step", id: "observe", status: "done", detail: "「死んだ」\u{1F480}を検出" };
    const d = new NdjsonDecoder();
    const s = encodeEvent(e);
    const mid = s.indexOf("\u{1F480}");
    assert.deepEqual([...d.push(s.slice(0, mid)), ...d.push(s.slice(mid))], [e]);
  });

  test("壊れた行・未知の種類は捨てて続ける（1行の破損で画面を固めない）", () => {
    const d = new NdjsonDecoder();
    const got = d.push(`{broken\n${JSON.stringify({ type: "unknown" })}\n${encodeEvent(ev)}`);
    assert.deepEqual(got, [ev]);
  });

  test("終端で改行が無いまま残った最後の行は flush で読む", () => {
    const d = new NdjsonDecoder();
    assert.deepEqual(d.push(JSON.stringify(ev)), []);
    assert.deepEqual(d.flush(), [ev]);
  });
});

// ── reducer ────────────────────────────────────────────────

describe("reducer：画面状態", () => {
  const apply = (events: AgentEvent[], from: AgentViewState = initialState()) => events.reduce(reduce, from);

  test("初期状態は全手順が pending（待機中でも手順が見える）", () => {
    const s = initialState();
    assert.equal(s.phase, "idle");
    for (const id of STEP_IDS) assert.equal(s.steps[id].status, "pending");
  });

  test("step イベントで手順の状態と所要時間が更新される", () => {
    const s = apply([
      { type: "plan", mode: "live", steps: [...STEP_IDS] },
      { type: "step", id: "observe", status: "done", detail: "d", ms: 12 },
    ]);
    assert.equal(s.phase, "running");
    assert.deepEqual(s.steps.observe, { status: "done", detail: "d", ms: 12 });
  });

  test("並列レーンの進行を追える", () => {
    const s = apply([
      { type: "lane", lane: "panel", phase: "start" },
      { type: "lane", lane: "gate", phase: "start" },
      { type: "lane", lane: "gate", phase: "end", ok: true, ms: 800 },
    ]);
    assert.equal(s.lanes.panel.status, "running");
    assert.deepEqual(s.lanes.gate, { status: "done", ms: 800 });
  });

  test("lane の失敗は failed になる", () => {
    const s = apply([{ type: "lane", lane: "panel", phase: "end", ok: false, ms: 5 }]);
    assert.equal(s.lanes.panel.status, "failed");
  });

  test("未知の手順IDは無視する（サーバーとクライアントのバージョンずれで落ちない）", () => {
    const before = initialState();
    const after = reduce(before, { type: "step", id: "nope" as never, status: "done" });
    assert.equal(after, before);
  });

  test("error になったら、実行中のまま残った手順を error にする（固まって見せない）", () => {
    const s = apply([
      { type: "step", id: "observe", status: "running" },
      { type: "error", code: "failed", message: "m" },
    ]);
    assert.equal(s.phase, "error");
    assert.equal(s.steps.observe.status, "error");
  });

  test("result も error も来ないまま切れたら connection_lost で止める", () => {
    const running = apply([{ type: "step", id: "investigate", status: "running" }]);
    const lost = reduce(running, { type: "connection_lost" });
    assert.equal(lost.phase, "error");
    assert.equal(lost.steps.investigate.status, "error");
  });

  test("完了後の connection_lost は結果を壊さない", () => {
    const done = reduce(initialState(), { type: "result", result: {} as AgentResult });
    assert.equal(reduce(done, { type: "connection_lost" }), done);
  });

  test("start は前回の結果を消して実行中にする。reset は待機に戻す", () => {
    const done = reduce(initialState(), { type: "result", result: {} as AgentResult });
    const started = reduce(done, { type: "start" });
    assert.equal(started.phase, "running");
    assert.equal(started.result, undefined);
    assert.equal(reduce(started, { type: "reset" }).phase, "idle");
  });
});
