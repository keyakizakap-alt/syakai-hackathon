import type { CheckResult, CultureId, Verdict } from "../types";

/**
 * 摩擦予防エージェントの型。
 *
 * このエージェントは「手順の計画は決定的なルール、判断（読む・直す・検証する）にLLMを使う」方式で、
 * LLMに次のツールを自由に選ばせない。理由は、Vercel の60秒制限、キー無しでは検証できないこと、
 * 「失敗しても安全と言わない」不変条件を保証しにくいこと、コストが非有界になること。
 * 自律性は、何を検証するか・時間切れで省くか・人に渡して止まるか、の判断と、
 * 修正案を自分で読み直す自己検証ループに持たせている。
 *
 * エージェントは助言まで。投稿・削除・通報はしない。
 */

export const STEP_IDS = ["observe", "investigate", "diagnose", "prescribe", "verify", "report"] as const;
export type StepId = (typeof STEP_IDS)[number];

/**
 * - waiting：人の判断待ち（⑥で線引きのずれがあるとき）。エラーではなく、意図した停止
 * - skipped：やらなかった。理由は detail に書く。「やっていない」を「問題なし」と見せない
 */
export type StepStatus = "pending" | "running" | "done" | "skipped" | "error" | "waiting";

export interface StepMeta {
  /** ①〜⑥ の表示番号 */
  no: string;
  label: string;
  /** 待機中に見せる、その手順が何をするかの説明（手順がそのまま製品の説明になる） */
  caption: string;
  /** この手順が呼ぶツール。画面のチップに出す */
  tool: string;
}

export const STEPS: Record<StepId, StepMeta> = {
  observe: { no: "①", label: "観測", caption: "用語集を照合する", tool: "glossary" },
  investigate: { no: "②", label: "調査", caption: "4文化で読む ＋ 逆翻訳ゲート（並列）", tool: "panel · gate" },
  diagnose: { no: "③", label: "診断", caption: "規範カードに照らして摩擦を分類", tool: "norms" },
  prescribe: { no: "④", label: "処方", caption: "添え書き or 選択肢を用意", tool: "friction" },
  verify: { no: "⑤", label: "検証", caption: "修正案で読み直し Before/After を測る", tool: "verify" },
  report: { no: "⑥", label: "報告", caption: "線引きは人に委ねて停止", tool: "—" },
};

/** 自己検証した修正案の種類。言い方なら添え書き付きの投稿、線引きなら言い換え案 */
export type CandidateKind = "note" | "rewrite";

export interface VerifyOutcome {
  culture: CultureId;
  candidate: CandidateKind;
  /** 検証に使った投稿文（添え書き付き、または言い換え案） */
  revisedText: string;
  /**
   * 検証モデルが**元の文**を読んだ結果。
   * メインの判定（panel）の値ではない。検証モデルは別ベンダーで採点の癖が違うため、
   * panel の値と検証後の値を比べると「修正の効果」ではなく「モデルの癖の差」を測ってしまう。
   * 同じ検証モデルで元の文と修正後を読み比べて初めて、差が修正の効果になる。
   */
  before: { verdict: Verdict; risk: number };
  after: { verdict: Verdict; risk: number };
}

export type SkipReason =
  /** NUANCE_AGENT_VERIFY=off */
  | "disabled"
  /** 経過時間が予算を超え、検証を始めなかった */
  | "time_budget"
  /** 検証を始めたが時間内に終わらなかった */
  | "timeout"
  | "error";

export interface VerifySkip {
  culture: CultureId;
  reason: SkipReason;
}

export interface AgentReport {
  mode: "live" | "demo";
  /**
   * 実際に呼んだツールの回数（用語集1 ＋ panel ＋ gate ＋ 検証）。縮退したときは panel が増える。
   * デモ再生では何も実行していないので 0。画面はデモのとき回数を出さない
   */
  toolCalls: number;
  /** live のみ。デモ再生では事前に用意した結果なので計測値を出さない */
  elapsedMs?: number;
  /** 設定上の検証モデル（障害時に候補へ切り替わった場合は実際と異なりうる） */
  verifier: string;
  /** 検証できた文化圏。ここにある文化圏だけが Before→After を表示できる */
  verified: VerifyOutcome[];
  /** 検証しようとしてできなかった文化圏。「改善した」と言ってはならない */
  skipped: VerifySkip[];
  /** 人の判断が要る文化圏（線引きのずれ）。エージェントは自動で決めない */
  handoff: CultureId[];
  /** panel が統合判定から文化ごとの分割判定に縮退した */
  degraded: boolean;
}

export interface AgentResult extends CheckResult {
  agent: AgentReport;
}

export type AgentErrorCode = "refusal" | "no_credentials" | "failed";

export type AgentEvent =
  /** これから行う手順の宣言。画面は全手順を pending で描く */
  | { type: "plan"; mode: "live" | "demo"; steps: StepId[] }
  | { type: "step"; id: StepId; status: StepStatus; detail?: string; ms?: number }
  /** ② の並列2レーン（panel / gate）の進行 */
  | { type: "lane"; lane: "panel" | "gate"; phase: "start" | "end"; ok?: boolean; ms?: number }
  | { type: "degrade"; kind: "panel_split" }
  | { type: "result"; result: AgentResult }
  | { type: "error"; code: AgentErrorCode; message: string };
