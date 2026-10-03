import {
  STEP_IDS,
  STEPS,
  type AgentErrorCode,
  type AgentEvent,
  type AgentResult,
  type StepId,
  type StepStatus,
} from "./types";

/**
 * エージェントの画面状態。イベントを畳み込む純関数にしてあるので、UI を描かずにテストできる。
 */

export interface StepView {
  status: StepStatus;
  detail?: string;
  ms?: number;
}

export interface LaneView {
  status: "idle" | "running" | "done" | "failed";
  ms?: number;
}

export interface AgentViewState {
  /** idle=待機（入力前）／running=実行中／done=完了／error=失敗 */
  phase: "idle" | "running" | "done" | "error";
  mode?: "live" | "demo";
  steps: Record<StepId, StepView>;
  lanes: { panel: LaneView; gate: LaneView };
  /** panel が統合判定から文化ごとの分割判定に縮退した */
  degraded: boolean;
  result?: AgentResult;
  error?: { code: AgentErrorCode; message: string };
}

function pendingSteps(): Record<StepId, StepView> {
  return Object.fromEntries(STEP_IDS.map((id) => [id, { status: "pending" } satisfies StepView])) as Record<
    StepId,
    StepView
  >;
}

export function initialState(): AgentViewState {
  return {
    phase: "idle",
    steps: pendingSteps(),
    lanes: { panel: { status: "idle" }, gate: { status: "idle" } },
    degraded: false,
  };
}

export type AgentAction =
  | AgentEvent
  /** 検査の開始。前回の結果を消して、実行中にする */
  | { type: "start" }
  | { type: "reset" }
  /** result も error も届かないままストリームが終わった（通信断など） */
  | { type: "connection_lost" };

/** 実行中のまま残っている手順を error にする。固まって見えるより、止まったと分かるほうがよい */
function failRunning(steps: Record<StepId, StepView>): Record<StepId, StepView> {
  return Object.fromEntries(
    STEP_IDS.map((id) => [id, steps[id].status === "running" ? { ...steps[id], status: "error" } : steps[id]]),
  ) as Record<StepId, StepView>;
}

export function reduce(state: AgentViewState, action: AgentAction): AgentViewState {
  switch (action.type) {
    case "reset":
      return initialState();

    case "start":
      return { ...initialState(), phase: "running" };

    case "plan":
      return { ...state, phase: "running", mode: action.mode, steps: pendingSteps() };

    case "step": {
      // 未知の手順IDは無視する（サーバーとクライアントのバージョンずれで落ちない）
      if (!(action.id in STEPS)) return state;
      return {
        ...state,
        phase: state.phase === "idle" ? "running" : state.phase,
        steps: {
          ...state.steps,
          [action.id]: { status: action.status, detail: action.detail, ms: action.ms },
        },
      };
    }

    case "lane": {
      const lane =
        action.phase === "start"
          ? ({ status: "running" } as const)
          : ({ status: action.ok === false ? "failed" : "done", ms: action.ms } as const);
      return { ...state, lanes: { ...state.lanes, [action.lane]: lane } };
    }

    case "degrade":
      return { ...state, degraded: true };

    case "result":
      return { ...state, phase: "done", result: action.result };

    case "error":
      return {
        ...state,
        phase: "error",
        steps: failRunning(state.steps),
        error: { code: action.code, message: action.message },
      };

    case "connection_lost":
      // すでに result / error で終わっていれば何もしない
      if (state.phase === "done" || state.phase === "error") return state;
      return {
        ...state,
        phase: "error",
        steps: failRunning(state.steps),
        error: { code: "failed", message: "通信が途中で切れました。もう一度お試しください。" },
      };
  }
}
