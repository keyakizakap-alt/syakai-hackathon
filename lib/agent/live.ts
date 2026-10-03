import { analyze, runPanelFor } from "../analyze";
import { lookupGlossary } from "../glossary";
import { resolveModel } from "../models";
import type { AgentDeps } from "./run";

/**
 * 本番の deps。run.ts は deps を注入される純粋な本体なので、実際の LLM 呼び出しへの配線だけをここに置く。
 * テストは run.ts に偽の deps を渡す（ここは通らない）。
 */
export function liveDeps(): AgentDeps {
  return {
    analyze,
    // 検証は生成（panel）と別ベンダーのモデルで読む。語彙は修正後の文で引き直す
    verify: (text, culture) => runPanelFor(text, lookupGlossary(text), culture, "verify"),
    now: () => Date.now(),
    verifier: resolveModel("verify").model,
    // コストと遅延の調整用。NUANCE_AGENT_VERIFY=off で⑤を無効にできる
    verifyEnabled: process.env.NUANCE_AGENT_VERIFY !== "off",
  };
}
