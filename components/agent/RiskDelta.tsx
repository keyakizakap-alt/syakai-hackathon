"use client";

import { CULTURES, type Verdict } from "@/lib/types";
import type { VerifyOutcome } from "@/lib/agent/types";

import { VERDICT_COLOR } from "./format";

function Bar({ label, value, verdict }: { label: string; value: number; verdict: Verdict }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[11px] text-(--color-muted)">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-line)" aria-hidden>
        {/* 幅は値そのまま。アニメーションは scaleX で左から伸ばす（reduced-motion では止まる） */}
        <div
          className="agent-grow h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: VERDICT_COLOR[verdict] }}
        />
      </div>
      <span className="w-7 shrink-0 text-right font-mono text-xs font-semibold" style={{ color: VERDICT_COLOR[verdict] }}>
        {value}
      </span>
    </div>
  );
}

/**
 * 検証した1文化圏の Before → After。
 * 「元の文」も「修正後」も同じ検証モデルが読んだ値。メインの判定の値とは別物（types.ts の VerifyOutcome 参照）。
 * 下がらなかった場合も隠さず、そのまま書く。
 */
export function RiskDelta({ outcome }: { outcome: VerifyOutcome }) {
  const meta = CULTURES[outcome.culture];
  const { before, after } = outcome;
  const delta = after.risk - before.risk;
  const verdictText =
    delta < 0
      ? "修正後は、リスクが下がりました"
      : delta === 0
        ? "修正しても、変わりませんでした"
        : "この修正では、下がりませんでした";
  // 下がった場合は差分バッジで足りる。下がらなかった場合は隠さず、文章でそのまま書く
  const deltaColor = delta < 0 ? "var(--color-green)" : delta > 0 ? "var(--color-red)" : "var(--color-muted)";

  return (
    <li
      className="space-y-1.5 rounded-lg border border-(--color-line) bg-(--color-ink) px-3 py-2.5"
      aria-label={`${meta.shortLabel}：検証モデルの読みで ${before.risk} から ${after.risk}。${verdictText}`}
    >
      {/* 狭い幅では、文字の途中ではなく塊ごと折り返す（「ファンカフ／ェ」のように1文字だけ落ちるのを防ぐ） */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
        <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: meta.accent }} />
          {meta.shortLabel}
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-(--color-muted)">{outcome.candidate === "note" ? "添え書き付き" : "言い換え案"}</span>
          <span className="font-mono font-semibold" style={{ color: deltaColor }}>
            {delta < 0 ? `↓${-delta}` : delta > 0 ? `↑${delta}` : "±0"}
          </span>
        </span>
      </div>
      <Bar label="元の文" value={before.risk} verdict={before.verdict} />
      <Bar label="修正後" value={after.risk} verdict={after.verdict} />
      {delta >= 0 && <p className="text-[11px] leading-relaxed text-(--color-yellow)">{verdictText}</p>}
    </li>
  );
}
