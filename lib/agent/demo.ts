import { demoResult, PRESETS } from "../demo";
import { summarizeFriction } from "../friction";
import { riskLabel } from "../summary";
import type { CultureId } from "../types";
import { handoffCultures, pickVerifyTargets } from "./policy";
import { diagnoseLine, observeLine, prescribeLine, reportLine, riskLine, verifyLine } from "./run";
import type { AgentEvent, AgentResult, VerifyOutcome } from "./types";

/**
 * デモ再生（APIキー無し）。
 *
 * 実行していない結果を、実行したかのように見せてはならない。そのため：
 * - 再生であることを mode: "demo" で明示し、画面は「デモ再生（事前に用意した結果）」と出す
 * - 所要時間（ms）とツール呼び出し回数は出さない。計測していない数値になるため
 * - 検証の Before/After は手書きの値で、実測ではない
 *
 * それでもデモを動かすのは、当日にAPIキーが使えなくても、エージェントがどう動くかを見せられるようにするため。
 * 修正案の選び方・人への引き渡しは本物の判断ルール（policy.ts）をそのまま通すので、
 * ルールを変えるとデモの検証対象も連動して変わり、手書きの値が足りなければテストが落ちる。
 */

/**
 * 検証モデルが読んだ [元の文, 修正後] の risk。手書きで、実測ではない。
 * 検証対象は policy が選ぶ（risk の高い順に最大2文化）。足りなければ demoAgentScript が例外を投げる。
 */
const DEMO_VERIFY: Record<string, Partial<Record<CultureId, [before: number, after: number]>>> = {
  polarity: { en_ao3: [82, 24], kr_fancafe: [41, 14] },
  interpretation: { en_ao3: [76, 22], kr_fancafe: [36, 18] },
  warning: { en_ao3: [88, 31], zh_weibo: [49, 20] },
  accountability: { kr_fancafe: [79, 38], en_ao3: [44, 22] },
};

export interface TimedEvent {
  /** このイベントを出す前に待つ時間（ms）。画面で手順が順に点灯する間隔 */
  delayMs: number;
  event: AgentEvent;
}

export function demoAgentScript(input: string): TimedEvent[] | null {
  const preset = PRESETS.find((p) => p.text === input.trim());
  const base = demoResult(input);
  if (!preset || !base) return null;

  const targets = pickVerifyTargets(input, base.cultures);
  const authored = DEMO_VERIFY[preset.id] ?? {};
  const verified: VerifyOutcome[] = targets.map((t) => {
    const pair = authored[t.culture];
    if (!pair) throw new Error(`デモの検証値が未定義です: ${preset.id} / ${t.culture}`);
    const [before, after] = pair;
    return {
      culture: t.culture,
      candidate: t.candidate.kind,
      revisedText: t.candidate.text,
      before: { verdict: riskLabel(before).verdict, risk: before },
      after: { verdict: riskLabel(after).verdict, risk: after },
    };
  });
  const handoff = handoffCultures(base.cultures);

  const result: AgentResult = {
    ...base,
    agent: {
      mode: "demo",
      toolCalls: 0,
      verifier: "デモ（事前に用意した結果）",
      verified,
      skipped: [],
      handoff,
      degraded: false,
    },
  };

  const at = (delayMs: number, event: AgentEvent): TimedEvent => ({ delayMs, event });
  return [
    at(0, { type: "plan", mode: "demo", steps: ["observe", "investigate", "diagnose", "prescribe", "verify", "report"] }),
    at(0, { type: "step", id: "observe", status: "running" }),
    at(350, { type: "step", id: "observe", status: "done", detail: observeLine(base.glossaryHits.map((h) => h.term)) }),
    at(0, { type: "step", id: "investigate", status: "running" }),
    at(0, { type: "lane", lane: "panel", phase: "start" }),
    at(0, { type: "lane", lane: "gate", phase: "start" }),
    at(700, { type: "lane", lane: "gate", phase: "end", ok: true }),
    at(450, { type: "lane", lane: "panel", phase: "end", ok: true }),
    at(0, { type: "step", id: "investigate", status: "done", detail: riskLine(base.cultures) }),
    at(0, { type: "step", id: "diagnose", status: "running" }),
    at(400, { type: "step", id: "diagnose", status: "done", detail: diagnoseLine(summarizeFriction(base.cultures)) }),
    at(0, { type: "step", id: "prescribe", status: "running" }),
    at(400, { type: "step", id: "prescribe", status: "done", detail: prescribeLine(base.cultures) }),
    at(0, { type: "step", id: "verify", status: "running" }),
    ...(verified.length > 0
      ? [at(900, { type: "step", id: "verify", status: "done", detail: verifyLine(verified, targets.length) } as AgentEvent)]
      : [at(300, { type: "step", id: "verify", status: "skipped", detail: "検証する修正案がありません" } as AgentEvent)]),
    at(0, { type: "step", id: "report", status: "running" }),
    at(300, { type: "step", id: "report", status: handoff.length > 0 ? "waiting" : "done", detail: reportLine(handoff) }),
    at(0, { type: "result", result }),
  ];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** スクリプトを時間差で流す。sleep を差し替えればテストで待たずに回せる */
export async function replayDemo(
  script: readonly TimedEvent[],
  emit: (event: AgentEvent) => void,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  for (const { delayMs, event } of script) {
    if (delayMs > 0) await sleep(delayMs);
    emit(event);
  }
}
