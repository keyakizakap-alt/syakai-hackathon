"use client";

import { useState } from "react";

import { CultureCard } from "@/components/CultureCard";
import { PromptBox } from "@/components/PromptBox";
import { RiskRadar } from "@/components/RiskRadar";
import { PRESETS } from "@/lib/demo";
import type { CheckResult, Verdict } from "@/lib/types";

const MAX_CHARS = 600;

const OVERALL: Record<Verdict, { dot: string; label: string; cls: string }> = {
  green: { dot: "🟢", label: "通関できます", cls: "text-(--color-green) border-(--color-green)/40 bg-(--color-green)/8" },
  yellow: { dot: "🟡", label: "誤読リスクあり", cls: "text-(--color-yellow) border-(--color-yellow)/40 bg-(--color-yellow)/8" },
  red: { dot: "🔴", label: "炎上リスクあり", cls: "text-(--color-red) border-(--color-red)/40 bg-(--color-red)/8" },
};

export function CheckPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(value: string) {
    const body = value.trim();
    if (!body || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析に失敗しました");
        return;
      }
      setResult(data as CheckResult);
    } catch {
      setError("サーバーに接続できませんでした");
    } finally {
      setLoading(false);
    }
  }

  const over = result ? OVERALL[result.overall] : null;

  return (
    <>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-(--color-muted)">
        機械翻訳は「感情の極性」を構造的に壊します。
        <span className="text-(--color-fg)">「かわいすぎて死んだ 💀」</span>
        は英語圏で脅迫として着弾しうる。投稿する前に、それを本人にだけ返します。
      </p>

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

      {loading && (
        <p className="rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-6 text-center text-sm text-(--color-muted)">
          4つの文化圏で並列に読ませ、逆翻訳で意味の保存を採点しています…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-(--color-red)/40 bg-(--color-red)/8 px-4 py-3 text-sm leading-relaxed text-(--color-red)">
          {error}
        </p>
      )}

      {result && over && (
        <div className="space-y-5">
          <section className="rise flex flex-col items-center gap-6 rounded-lg border border-(--color-line) bg-(--color-panel) px-5 py-5 sm:flex-row sm:items-start">
            <RiskRadar readings={result.cultures} />

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${over.cls}`}>
                  {over.dot} {over.label}
                </span>
                <span className="font-mono text-xs text-(--color-muted)">
                  {result.mode === "demo" ? "DEMO MODE" : `${(result.elapsedMs / 1000).toFixed(1)}s`}
                </span>
              </div>

              <p className="mb-4 rounded border border-(--color-line) bg-(--color-ink) px-3 py-2 text-sm leading-relaxed">
                {result.input}
              </p>

              {result.glossaryHits.length > 0 && (
                <div>
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-(--color-muted)">
                    検出されたファンダム語彙（用語集から動的に注入）
                  </h2>
                  <ul className="space-y-2">
                    {result.glossaryHits.map((h) => (
                      <li key={h.term} className="rounded border border-(--color-line) bg-(--color-ink) px-3 py-2 text-xs leading-relaxed">
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
                </div>
              )}
            </div>
          </section>

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
      )}
    </>
  );
}
