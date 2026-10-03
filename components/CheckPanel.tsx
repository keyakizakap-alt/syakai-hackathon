"use client";

import { useState } from "react";

import { AgentConsole } from "@/components/agent/AgentConsole";
import { useAgentRun } from "@/components/agent/useAgentRun";
import { CopyButton } from "@/components/CopyButton";
import { CultureCard } from "@/components/CultureCard";
import { PromptBox } from "@/components/PromptBox";
import { RiskRadar } from "@/components/RiskRadar";
import { PRESETS } from "@/lib/demo";
import { riskLabel, worstCulture } from "@/lib/summary";
import type { Verdict } from "@/lib/types";

const MAX_CHARS = 600;

const OVERALL: Record<Verdict, { dot: string; label: string; cls: string }> = {
  green: { dot: "🟢", label: "通関できます", cls: "text-(--color-green) border-(--color-green)/40 bg-(--color-green)/8" },
  yellow: { dot: "🟡", label: "誤読リスクあり", cls: "text-(--color-yellow) border-(--color-yellow)/40 bg-(--color-yellow)/8" },
  red: { dot: "🔴", label: "炎上リスクあり", cls: "text-(--color-red) border-(--color-red)/40 bg-(--color-red)/8" },
};

export function CheckPanel() {
  const [text, setText] = useState("");
  // 通信と進捗の畳み込みは hook に任せる。実行中の様子は AgentConsole が見せる
  const { state, run } = useAgentRun();
  const result = state.result ?? null;
  const loading = state.phase === "running";
  const error = state.phase === "error" ? (state.error?.message ?? "解析に失敗しました") : null;

  function check(value: string) {
    const body = value.trim();
    if (!body || loading) return;
    void run(body);
  }

  const over = result ? OVERALL[result.overall] : null;
  const worst = result ? worstCulture(result.cultures) : null;
  const score = worst?.risk ?? 0;
  const { label: scoreLabel } = riskLabel(score);
  // 該当箇所がない場合（逆翻訳ゲートのみで昇格した等）にチップを無理に作らない
  const toneChips = worst ? [...new Set(worst.triggers.map((t) => t.span))].slice(0, 6) : [];

  return (
    <>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-(--color-muted)">
        機械翻訳は「感情の極性」を構造的に壊します。
        <span className="text-(--color-fg)">「かわいすぎて死んだ 💀」</span>
        は英語圏で脅迫として着弾しうる。投稿する前に、それを本人にだけ返します。
      </p>

      {/* 入力＝左1行目、結果＝右で2行分、エージェント＝左2行目。
          下の行を 1fr にするのは、右の結果が縦に長いとき、余白が入力とエージェントの間ではなく
          エージェントの下に出るようにするため（行をまたぐ要素の超過分は 1fr の行が吸収する）。
          DOM 順は 入力→結果→エージェント なので、モバイルでは結果の直後にエージェントが出る。 */}
      <div className="grid gap-5 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <PromptBox
            presets={PRESETS}
            value={text}
            onChange={setText}
            onSubmit={check}
            loading={loading}
            maxChars={MAX_CHARS}
            placeholder="海外に出す前の一文を貼り付けてください（上のプリセットからも試せます）"
            submitLabel="世界に出す前に検める"
            loadingLabel="審査中…"
            stale={Boolean(result) && text.trim() !== result?.input}
          />
        </div>

        <section className="rise flex flex-col rounded-xl border border-(--color-line) bg-(--color-panel) p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-64">
          {!result && !loading && !error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <span aria-hidden className="text-2xl opacity-40">
                🔍
              </span>
              <p className="text-sm text-(--color-muted)">
                検査結果はここに表示されます。プリセットを押すか、文章を入力して検めてください。
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-(--color-muted)">
              <p>4つの文化圏で並列に読ませ、逆翻訳で意味の保存を採点しています…</p>
            </div>
          )}

          {error && !loading && (
            <p className="rounded-lg border border-(--color-red)/40 bg-(--color-red)/8 px-4 py-3 text-sm leading-relaxed text-(--color-red)">
              {error}
            </p>
          )}

          {result && over && worst && !loading && (
            <div className="space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden>🛃</span> 検査結果
                </h2>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${OVERALL[riskLabel(score).verdict].cls}`}
                  >
                    リスク {scoreLabel}（{score}/100）
                  </span>
                  <span className="font-mono text-[11px] text-(--color-muted)">
                    {result.mode === "demo" ? "DEMO" : `${(result.elapsedMs / 1000).toFixed(1)}s`}
                  </span>
                </div>
              </header>

              <span className={`inline-block w-fit rounded-full border px-3 py-1 text-sm font-semibold ${over.cls}`}>
                {over.dot} {over.label}
              </span>

              {toneChips.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">
                    引っかかった表現（最もリスクが高い文化圏より）
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {toneChips.map((span, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-(--color-red)/40 bg-(--color-red)/8 px-2 py-1 font-mono text-xs text-(--color-red)"
                      >
                        {span}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {worst.rewrite && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-(--color-muted)">言い換え案</h3>
                    <CopyButton text={worst.rewrite} />
                  </div>
                  <p className="rounded-lg border border-(--color-green)/30 bg-(--color-green)/8 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {worst.rewrite}
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">解説</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-(--color-muted)">{worst.reading}</p>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-(--color-muted)">文化圏別のリスク</h3>
                <RiskRadar readings={result.cultures} />
              </div>
            </div>
          )}
        </section>

        {/* 入力欄の下の空き領域。エージェントの作業を見せる。添え書きや言い換え案は入力欄へ反映するだけで、
            再検査は人が押す（人が承認するループ）。 */}
        <AgentConsole state={state} onApply={setText} className="lg:col-start-1 lg:row-start-2" />
      </div>

      {result && (
        <div className="mt-5 space-y-5">
          {result.glossaryHits.length > 0 && (
            <section className="rise rounded-xl border border-(--color-line) bg-(--color-panel) px-5 py-4">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-(--color-muted)">
                検出されたファンダム語彙（用語集から動的に注入）
              </h2>
              <ul className="space-y-2">
                {result.glossaryHits.map((h) => (
                  <li key={h.term} className="rounded-lg border border-(--color-line) bg-(--color-ink) px-3 py-2 text-xs leading-relaxed">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-(--color-fg)">{h.term}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            h.polarity === "positive"
                              ? "var(--color-green)"
                              : h.polarity === "negative"
                                ? "var(--color-red)"
                                : "var(--color-line)",
                          color: h.polarity === "neutral" ? "var(--color-muted)" : "var(--color-ink)",
                        }}
                      >
                        {h.polarity === "positive" ? "肯定" : h.polarity === "negative" ? "否定" : "中立"} · 強度{" "}
                        {h.intensity}/5
                      </span>
                    </div>
                    <p className="text-(--color-muted)">{h.meaning}</p>
                    <p className="mt-1 text-(--color-yellow)">
                      誤訳例「{h.commonMistranslation}」 — {h.danger}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-(--color-muted)">文化圏別の詳細</h2>
            <div className="grid gap-4">
              {result.cultures.map((c) => (
                <CultureCard
                  key={c.culture}
                  reading={c}
                  gate={result.backTranslations.find((g) => g.culture === c.culture)}
                  input={result.input}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
