"use client";

import type { AgentViewState } from "@/lib/agent/reducer";
import { STEP_IDS, STEPS } from "@/lib/agent/types";

import { formatMs } from "./format";
import { DiagnoseDetails, PrescribeDetails, ReportDetails, VerifyDetails } from "./StepDetails";
import { STATUS_LABEL, StepNode } from "./StepNode";
import { useElapsedMs } from "./useAgentRun";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-ink) px-2.5 py-1.5">
      <div className="text-[10px] text-(--color-muted)">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

/**
 * 摩擦予防エージェントのコンソール。出国審査の左カラムの空き領域に置く。
 *
 * 待機中は手順がそのまま製品の説明になり、実行中は実際の呼び出しの進行に合わせて点灯し、
 * 完了すると実測のサマリと Before→After、人に委ねた判断が並ぶ。
 * 実行していない値は出さない：デモ再生では所要時間とツール回数を表示しない。
 */
export function AgentConsole({
  state,
  onApply,
  className = "",
}: {
  state: AgentViewState;
  /** 入力欄へ反映する。再検査は人が押す（人が承認するループ） */
  onApply: (text: string) => void;
  className?: string;
}) {
  const { phase, result } = state;
  const demo = (result?.agent.mode ?? state.mode) === "demo";
  const running = phase === "running";
  const elapsed = useElapsedMs(running && !demo);

  const current = [...STEP_IDS].reverse().find((id) => state.steps[id].status !== "pending");
  const announce = current ? `${STEPS[current].label}：${STATUS_LABEL[state.steps[current].status]}` : "";

  const chip = (() => {
    if (phase === "idle") return { text: "待機中", cls: "border-(--color-line) text-(--color-muted)" };
    if (phase === "error") return { text: "停止", cls: "border-(--color-red)/40 bg-(--color-red)/8 text-(--color-red)" };
    if (running)
      return {
        text: demo ? "デモ再生中" : `実行中 ${(elapsed / 1000).toFixed(1)}s`,
        cls: "border-(--color-accent-a)/40 bg-(--color-accent-a)/12 text-(--color-accent-a)",
      };
    const t = demo ? "デモ再生" : `完了 ${formatMs(result?.agent.elapsedMs) ?? ""}`;
    return { text: t, cls: "border-(--color-accent-a)/40 bg-(--color-accent-a)/12 text-(--color-accent-a)" };
  })();

  const agent = result?.agent;
  const verifyTotal = agent ? agent.verified.length + agent.skipped.length : 0;
  const showResultDetails = Boolean(result) && phase === "done";

  return (
    <section
      data-testid="agent-console"
      data-phase={phase}
      aria-labelledby="agent-console-title"
      className={`rise overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel) ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-line) px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="accent-gradient flex h-7 w-7 items-center justify-center rounded-md text-sm">
            🛂
          </span>
          <h2 id="agent-console-title" className="text-sm font-semibold">
            摩擦予防エージェント
          </h2>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${chip.cls}`}>{chip.text}</span>
      </header>

      {agent && phase === "done" && (
        <div className="border-b border-(--color-line) px-4 py-3">
          {demo ? (
            <p className="rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-(--color-yellow)">
              デモ再生（事前に用意した結果）です。実行していないので、所要時間とツール回数は出しません。
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="手順"
                value={`${STEP_IDS.filter((id) => ["done", "waiting", "skipped"].includes(state.steps[id].status)).length}/${STEP_IDS.length}`}
              />
              <Stat label="ツール呼び出し" value={`${agent.toolCalls}回`} />
              <Stat label="検証" value={verifyTotal > 0 ? `${agent.verified.length}/${verifyTotal}` : "—"} />
              <Stat label="要判断" value={`${agent.handoff.length}件`} />
            </div>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <ol className="px-4 pt-4">
        {STEP_IDS.map((id, i) => (
          <StepNode
            key={id}
            id={id}
            view={state.steps[id]}
            lanes={id === "investigate" ? state.lanes : undefined}
            degraded={id === "investigate" ? state.degraded : undefined}
            last={i === STEP_IDS.length - 1}
          >
            {showResultDetails && result && id === "diagnose" && state.steps.diagnose.status === "done" && (
              <DiagnoseDetails result={result} />
            )}
            {showResultDetails && result && id === "prescribe" && (
              <PrescribeDetails result={result} input={result.input} onApply={onApply} />
            )}
            {showResultDetails && result && id === "verify" && <VerifyDetails result={result} />}
            {showResultDetails && result && id === "report" && <ReportDetails result={result} onApply={onApply} />}
          </StepNode>
        ))}
      </ol>

      <footer className="border-t border-(--color-line) px-4 py-2.5 text-[11px] leading-relaxed text-(--color-muted)">
        助言までを行います。投稿・削除・通報はしません。判定は本人にだけ返ります。
      </footer>
    </section>
  );
}
