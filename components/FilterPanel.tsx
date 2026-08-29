"use client";

import { useState } from "react";

import { PromptBox } from "@/components/PromptBox";
import { FILTER_PRESETS } from "@/lib/demo-filter";
import { WORKS } from "@/lib/works";
import { WORK_LANG_LABEL, type FilterDecision, type FilterResult, type WorkLang, type WorkVerdict } from "@/lib/types";

const MAX_CHARS = 400;

const DECISION: Record<FilterDecision, { label: string; cls: string; dot: string; chip: string }> = {
  block: {
    label: "遮断",
    dot: "🔴",
    cls: "text-(--color-red) border-(--color-red)/40 bg-(--color-red)/8",
    chip: "border-(--color-red)/40 bg-(--color-red)/8 text-(--color-red)",
  },
  warn: {
    label: "注意",
    dot: "🟡",
    cls: "text-(--color-yellow) border-(--color-yellow)/40 bg-(--color-yellow)/8",
    chip: "border-(--color-yellow)/40 bg-(--color-yellow)/8 text-(--color-yellow)",
  },
  pass: {
    label: "通過",
    dot: "🟢",
    cls: "text-(--color-green) border-(--color-green)/40 bg-(--color-green)/8",
    chip: "border-(--color-line) bg-(--color-ink) text-(--color-muted)",
  },
};

const LANG_CLS: Record<WorkLang, string> = {
  ja: "bg-[#b07fd8]",
  en: "bg-[#5a9fe0]",
  ko: "bg-[#4dc0b5]",
  zh: "bg-[#d67bb0]",
};

function WorkCard({ verdict }: { verdict: WorkVerdict }) {
  const work = WORKS.find((w) => w.id === verdict.workId);
  const [revealed, setRevealed] = useState(false);
  if (!work) return null;

  const d = DECISION[verdict.decision];
  const hidden = verdict.decision === "block" && !revealed;

  return (
    <article className="rise overflow-hidden rounded-lg border border-(--color-line) bg-(--color-panel)">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-line) px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-(--color-ink) ${LANG_CLS[work.lang]}`}>
            {WORK_LANG_LABEL[work.lang]}
          </span>
          <h3 className={`truncate text-sm font-semibold ${hidden ? "blur-[5px] select-none" : ""}`}>{work.title}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${d.cls}`}>
          {d.dot} {d.label} · 確信度 {verdict.confidence}
        </span>
      </header>

      <div className="space-y-3 px-4 py-3 text-sm">
        <p className="leading-relaxed text-(--color-muted)">{verdict.reason}</p>

        {verdict.matched.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {verdict.matched.map((m, i) => (
              <span key={i} className={`rounded border px-2 py-0.5 font-mono text-[11px] ${d.chip}`}>
                {m}
              </span>
            ))}
          </div>
        )}

        {verdict.missingWarnings.length > 0 && (
          <div className="rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-3 py-2">
            <p className="mb-1 text-xs font-semibold text-(--color-yellow)">
              警告の越境失効 — 受信側の規範では宣言されているべきなのに、欠けているもの
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-xs leading-relaxed text-(--color-yellow)">
              {verdict.missingWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={`rounded border border-(--color-line) bg-(--color-ink) px-3 py-2 text-xs ${hidden ? "blur-[5px] select-none" : ""}`}>
          <p className="mb-1.5 leading-relaxed">{work.summary}</p>
          <p className="text-(--color-muted)">
            タグ: {work.tags.join(" / ") || "（なし）"}
            <br />
            作者の警告: {work.declaredWarnings.join(" / ") || "（なし）"}
          </p>
        </div>

        {verdict.decision === "block" && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="text-xs text-(--color-muted) underline underline-offset-4 transition hover:text-(--color-fg)"
          >
            {revealed ? "また隠す" : "それでも開く"}
          </button>
        )}
      </div>
    </article>
  );
}

export function FilterPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<FilterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(value: string) {
    const declaration = value.trim();
    if (!declaration || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declaration }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "フィルタに失敗しました");
        return;
      }
      setResult(data as FilterResult);
    } catch {
      setError("サーバーに接続できませんでした");
    } finally {
      setLoading(false);
    }
  }

  const counts = result
    ? result.verdicts.reduce<Record<FilterDecision, number>>(
        (acc, v) => {
          acc[v.decision] += 1;
          return acc;
        },
        { block: 0, warn: 0, pass: 0 },
      )
    : null;

  return (
    <>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-(--color-muted)">
        英語圏はコンテンツ警告が事実上の義務、日本語圏は「※」形式、中国語圏は「雷点」。
        <span className="text-(--color-fg)">タグが翻訳されないため、警告だけが国境で失効します。</span>
        見たくないものを自分の言葉で書けば、どの言語圏の作品でも事前に遮断します。
      </p>

      <PromptBox
        presets={FILTER_PRESETS}
        value={text}
        onChange={setText}
        onSubmit={run}
        loading={loading}
        maxChars={MAX_CHARS}
        placeholder="見たくないものを、自分の言葉で書いてください（タグ名を知らなくて構いません）"
        submitLabel="入国審査をかける"
        loadingLabel="照合中…"
        stale={Boolean(result) && text.trim() !== result?.declaration}
      />

      {loading && (
        <p className="rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-6 text-center text-sm text-(--color-muted)">
          宣言を各言語圏のタグ語彙に写像し、{WORKS.length} 件の作品と照合しています…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-(--color-red)/40 bg-(--color-red)/8 px-4 py-3 text-sm leading-relaxed text-(--color-red)">
          {error}
        </p>
      )}

      {result && counts && (
        <div className="space-y-5">
          <section className="rise rounded-lg border border-(--color-line) bg-(--color-panel) px-5 py-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-(--color-red)/40 bg-(--color-red)/8 px-3 py-1 text-sm font-semibold text-(--color-red)">
                遮断 {counts.block}
              </span>
              <span className="rounded-full border border-(--color-yellow)/40 bg-(--color-yellow)/8 px-3 py-1 text-sm font-semibold text-(--color-yellow)">
                注意 {counts.warn}
              </span>
              <span className="rounded-full border border-(--color-green)/40 bg-(--color-green)/8 px-3 py-1 text-sm font-semibold text-(--color-green)">
                通過 {counts.pass}
              </span>
              <span className="font-mono text-xs text-(--color-muted)">
                {result.mode === "demo" ? "DEMO MODE" : `${(result.elapsedMs / 1000).toFixed(1)}s`}
              </span>
            </div>

            <h2 className="mb-2 text-xs font-semibold tracking-wide text-(--color-muted)">
              宣言から抽出された遮断対象
            </h2>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {result.profile.elements.map((e, i) => (
                <span key={i} className="rounded border border-(--color-line) bg-(--color-ink) px-2 py-1 text-xs">
                  {e}
                </span>
              ))}
            </div>

            <h2 className="mb-1 text-xs font-semibold tracking-wide text-(--color-muted)">
              各言語圏のタグ語彙への写像
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-(--color-muted)">
              1対1の対応表では機能しません。同じ要素が、言語圏と条件によって別のタグになります。
            </p>
            <div className="space-y-3">
              {result.profile.mappings.map((m, i) => (
                <div key={i} className="overflow-hidden rounded border border-(--color-line) bg-(--color-ink)">
                  <div className="border-b border-(--color-line) px-3 py-1.5 text-xs font-semibold">
                    「{m.source}」
                  </div>
                  <ul className="divide-y divide-(--color-line)">
                    {m.targets.map((t, j) => (
                      <li key={j} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-baseline sm:gap-3">
                        <span className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-(--color-ink) ${LANG_CLS[t.lang]}`}>
                          {WORK_LANG_LABEL[t.lang]}
                        </span>
                        <span className="w-fit shrink-0 font-mono font-semibold">{t.tag}</span>
                        <span className="leading-relaxed text-(--color-muted)">{t.condition}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3">
            {result.verdicts.map((v) => (
              <WorkCard key={v.workId} verdict={v} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
