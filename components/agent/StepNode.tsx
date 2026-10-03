"use client";

import type { ReactNode } from "react";

import type { LaneView, StepView } from "@/lib/agent/reducer";
import { STEPS, type StepId, type StepStatus } from "@/lib/agent/types";

import { formatMs } from "./format";

export const STATUS_LABEL: Record<StepStatus, string> = {
  pending: "待機中",
  running: "実行中",
  done: "完了",
  skipped: "省略",
  error: "失敗",
  waiting: "人の判断待ち",
};

/**
 * 手順の状態を示す丸。判定の信号色（赤黄緑）とは別系統の accent 色で描く。
 * 色だけに頼らないよう、状態ごとに記号も変える（✓ / ◆ / – / !）。
 */
function StatusDot({ status }: { status: StepStatus }) {
  const base = "relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none";
  const style: Record<StepStatus, string> = {
    pending: "border border-(--color-line) text-transparent",
    running: "agent-pulse border-2 border-(--color-accent-a) text-transparent",
    done: "accent-gradient text-white",
    waiting: "border-2 border-(--color-accent-b) bg-(--color-accent-b)/20 text-(--color-accent-b)",
    skipped: "border border-dashed border-(--color-muted) text-(--color-muted)",
    error: "border-2 border-(--color-red) text-(--color-red)",
  };
  const glyph: Record<StepStatus, string> = {
    pending: "",
    running: "",
    done: "✓",
    waiting: "◆",
    skipped: "–",
    error: "!",
  };
  return (
    <span aria-hidden className={`${base} ${style[status]}`}>
      {glyph[status]}
    </span>
  );
}

/** ②の並列レーン。実行中は流れる帯、完了で満ち、失敗で赤くなる */
function Lane({ label, lane }: { label: string; lane: LaneView }) {
  const fill =
    lane.status === "running"
      ? "agent-indeterminate"
      : lane.status === "done"
        ? "w-full bg-(--color-accent-a)"
        : lane.status === "failed"
          ? "w-full bg-(--color-red)"
          : "w-0";
  const ms = formatMs(lane.ms);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-(--color-muted)">
        <span className="truncate">{label}</span>
        <span className="font-mono">{lane.status === "failed" ? "失敗" : (ms ?? "")}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-(--color-line)" aria-hidden>
        <div className={`h-full rounded-full ${fill}`} />
      </div>
    </div>
  );
}

export function StepNode({
  id,
  view,
  lanes,
  degraded,
  last,
  children,
}: {
  id: StepId;
  view: StepView;
  /** ②（investigate）のときだけ渡す */
  lanes?: { panel: LaneView; gate: LaneView };
  degraded?: boolean;
  last: boolean;
  children?: ReactNode;
}) {
  const meta = STEPS[id];
  const pending = view.status === "pending";
  const ms = formatMs(view.ms);
  const showLanes = lanes && view.status !== "pending";

  return (
    <li className="relative flex gap-3" data-step={id} data-status={view.status}>
      <div className="flex flex-col items-center pt-0.5">
        <StatusDot status={view.status} />
        {!last && (
          <span
            aria-hidden
            className={`agent-rail mt-1 w-px flex-1 ${view.status === "done" || view.status === "skipped" || view.status === "waiting" ? "bg-(--color-accent-a)/60" : "bg-(--color-line)"}`}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={`text-sm font-semibold ${pending ? "text-(--color-muted)" : ""}`}>
            <span aria-hidden className="mr-1 font-normal text-(--color-muted)">
              {meta.no}
            </span>
            {meta.label}
            <span className="sr-only">（{STATUS_LABEL[view.status]}）</span>
          </h3>
          {meta.tool && (
            <span className="rounded border border-(--color-line) px-1.5 py-0.5 font-mono text-[10px] text-(--color-muted)">
              {meta.tool}
            </span>
          )}
          {ms && <span className="ml-auto font-mono text-[11px] text-(--color-muted)">{ms}</span>}
        </div>

        <p className={`mt-0.5 text-xs leading-relaxed ${pending ? "text-(--color-muted)/80" : "text-(--color-fg)"}`}>
          {view.detail ?? (pending ? meta.caption : view.status === "running" ? `${meta.caption}…` : meta.caption)}
        </p>

        {showLanes && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Lane label="4文化で読む" lane={lanes.panel} />
            <Lane label="逆翻訳ゲート" lane={lanes.gate} />
          </div>
        )}
        {degraded && showLanes && (
          <p className="mt-2 rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-(--color-yellow)">
            縮退運転：統合判定が失敗したため、4文化を個別のリクエストに分けて再試行しました
          </p>
        )}

        {children}
      </div>
    </li>
  );
}
