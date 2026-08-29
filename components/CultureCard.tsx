"use client";

import { CULTURES, type BackTranslation, type CultureReading, type DriftDimension, type Verdict } from "@/lib/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  green: "そのまま出せる",
  yellow: "誤読リスク",
  red: "炎上リスク",
};

const VERDICT_DOT: Record<Verdict, string> = { green: "🟢", yellow: "🟡", red: "🔴" };

const VERDICT_CLASS: Record<Verdict, string> = {
  green: "text-(--color-green) border-(--color-green)/40 bg-(--color-green)/8",
  yellow: "text-(--color-yellow) border-(--color-yellow)/40 bg-(--color-yellow)/8",
  red: "text-(--color-red) border-(--color-red)/40 bg-(--color-red)/8",
};

const DIM_LABEL: Record<DriftDimension, string> = {
  polarity: "極性",
  register: "敬語・距離感",
  entities: "固有名詞・数値",
  negation: "否定構造",
};

function meterColor(v: number): string {
  if (v <= 20) return "var(--color-red)";
  if (v <= 55) return "var(--color-yellow)";
  return "var(--color-green)";
}

/** 原文中の該当箇所をハイライトする。span は原文の部分文字列であることが保証されている。 */
function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  if (spans.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    // 現在位置から最も早く現れる span を探す
    let bestIdx = -1;
    let bestSpan = "";
    for (const s of spans) {
      const i = rest.indexOf(s);
      if (i === -1) continue;
      if (bestIdx === -1 || i < bestIdx || (i === bestIdx && s.length > bestSpan.length)) {
        bestIdx = i;
        bestSpan = s;
      }
    }
    if (bestIdx === -1) {
      parts.push(<span key={key++}>{rest}</span>);
      break;
    }
    if (bestIdx > 0) parts.push(<span key={key++}>{rest.slice(0, bestIdx)}</span>);
    parts.push(
      <mark key={key++} className="rounded bg-(--color-red)/25 px-0.5 text-(--color-fg) underline decoration-(--color-red) decoration-wavy underline-offset-4">
        {bestSpan}
      </mark>,
    );
    rest = rest.slice(bestIdx + bestSpan.length);
  }
  return <>{parts}</>;
}

export function CultureCard({
  reading,
  gate,
  input,
}: {
  reading: CultureReading;
  gate: BackTranslation | undefined;
  input: string;
}) {
  const meta = CULTURES[reading.culture];
  const spans = reading.triggers.map((t) => t.span);

  return (
    <article className="rise overflow-hidden rounded-lg border border-(--color-line) bg-(--color-panel)">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-line) px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.accent }} />
          <h3 className="font-semibold">{meta.label}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${VERDICT_CLASS[reading.verdict]}`}>
          {VERDICT_DOT[reading.verdict]} {VERDICT_LABEL[reading.verdict]} · {reading.risk}
        </span>
      </header>

      <div className="space-y-4 px-4 py-4 text-sm">
        <section>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">この文化圏ではこう読まれる</h4>
          <p className="whitespace-pre-wrap leading-relaxed">{reading.reading}</p>
        </section>

        {reading.triggers.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">引っかかる箇所</h4>
            <p className="mb-2 rounded border border-(--color-line) bg-(--color-ink) px-3 py-2 leading-relaxed">
              <Highlighted text={input} spans={spans} />
            </p>
            <ul className="space-y-1.5">
              {reading.triggers.map((t, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-mono text-(--color-red)">{t.span}</span>
                  <span className="text-(--color-muted)"> — {t.why}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {gate && gate.translation && (
          <section>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">
              逆翻訳ゲート
              <span className="ml-1.5 font-normal normal-case">（訳 → 原語に戻す → 何が失われたか）</span>
            </h4>
            <dl className="mb-2 space-y-1 rounded border border-(--color-line) bg-(--color-ink) px-3 py-2 text-xs leading-relaxed">
              <div>
                <dt className="inline text-(--color-muted)">訳文：</dt>
                <dd className="inline">{gate.translation}</dd>
              </div>
              <div>
                <dt className="inline text-(--color-muted)">逆翻訳：</dt>
                <dd className="inline">{gate.backTranslation}</dd>
              </div>
            </dl>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {(Object.keys(DIM_LABEL) as DriftDimension[]).map((d) => {
                const v = gate.dimensions[d];
                return (
                  <li key={d}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-(--color-muted)">{DIM_LABEL[d]}</span>
                      <span className="font-mono font-semibold" style={{ color: meterColor(v) }}>
                        {v}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-(--color-line)">
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: meterColor(v) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {gate.drift && (
              <p className="mt-2 rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-3 py-2 text-xs leading-relaxed text-(--color-yellow)">
                {gate.drift}
              </p>
            )}
          </section>
        )}

        {reading.rewrite && (
          <section>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-(--color-muted)">
              この文化圏向けの言い換え案
            </h4>
            <p className="rounded border border-(--color-green)/30 bg-(--color-green)/8 px-3 py-2 leading-relaxed whitespace-pre-wrap">
              {reading.rewrite}
            </p>
          </section>
        )}
      </div>
    </article>
  );
}
