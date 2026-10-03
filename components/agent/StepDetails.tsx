"use client";

import type { ReactNode } from "react";

import { CopyButton } from "@/components/CopyButton";
import { citedNorms, frictionState, type FrictionState } from "@/lib/friction";
import type { AgentResult, SkipReason } from "@/lib/agent/types";
import { CULTURES, type CultureId, type CultureReading } from "@/lib/types";

import { RiskDelta } from "./RiskDelta";

const BADGE: Record<FrictionState, { text: string; cls: string }> = {
  wording: { text: "言い方のずれ", cls: "border-(--color-accent-a)/40 bg-(--color-accent-a)/12 text-(--color-accent-a)" },
  boundary: { text: "線引きのずれ", cls: "border-(--color-accent-b)/40 bg-(--color-accent-b)/12 text-(--color-accent-b)" },
  unclassified: { text: "分類なし", cls: "border-(--color-line) text-(--color-muted)" },
  // 未検査は「摩擦なし」ではない。判定の黄色に寄せて、安全に見えないようにする
  unjudged: { text: "未検査", cls: "border-(--color-yellow)/40 bg-(--color-yellow)/8 text-(--color-yellow)" },
  clean: { text: "検出なし", cls: "border-(--color-line) text-(--color-muted)" },
};

const SKIP_REASON: Record<SkipReason, string> = {
  disabled: "検証が無効になっています",
  time_budget: "時間の予算を超えたため、始めませんでした",
  timeout: "時間内に終わりませんでした",
  error: "検証に失敗しました",
};

function FrictionBadge({ state }: { state: FrictionState }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE[state].cls}`}>{BADGE[state].text}</span>
  );
}

function CultureName({ culture }: { culture: CultureId }) {
  const meta = CULTURES[culture];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: meta.accent }} />
      {meta.shortLabel}
    </span>
  );
}

/** 展開できる補足。タイトル行だけを常に見せ、中身は開いたときだけ */
function Fold({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="mt-2 rounded-lg border border-(--color-line) bg-(--color-ink)/60">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] text-(--color-muted) transition hover:text-(--color-fg)">
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

// ── ③ 診断：根拠の規範と種別 ─────────────────────────────────

function reasonLine(r: CultureReading, state: FrictionState): string | null {
  if (state === "unjudged") return "この文化圏は判定を取得できませんでした。未検査で、安全とは見なせません。";
  if (state === "clean") return "摩擦のもとは検出されませんでした。";
  if (state === "unclassified") return "規範カードに該当する項目がありません（逆翻訳ゲートによる検出など）。";
  return null;
}

export function DiagnoseDetails({ result }: { result: AgentResult }) {
  return (
    <Fold title="根拠にした規範と、摩擦の種類">
      <ul className="space-y-2">
        {result.cultures.map((r) => {
          const state = frictionState(r);
          const norms = state === "wording" || state === "boundary" ? citedNorms(r) : [];
          const line = reasonLine(r, state);
          return (
            <li key={r.culture} className="rounded border border-(--color-line) bg-(--color-panel) px-3 py-2">
              <div className="flex items-center gap-2">
                <CultureName culture={r.culture} />
                <FrictionBadge state={state} />
                <span className="ml-auto font-mono text-[11px] text-(--color-muted)">{r.unjudged ? "—" : r.risk}</span>
              </div>
              {line && <p className="mt-1.5 text-[11px] leading-relaxed text-(--color-muted)">{line}</p>}
              {norms.map((n) => (
                <p key={n.no} className="mt-1.5 text-[11px] leading-relaxed text-(--color-muted)">
                  <span className="mr-1 font-mono text-(--color-fg)">#{n.no}</span>
                  {n.text}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] leading-relaxed text-(--color-muted)">
        「言い方」＝語や表記を直せば消える／「線引き」＝行為や題材を変えない限り残る。この分類は本プロダクトの整理です。
      </p>
    </Fold>
  );
}

// ── ④ 処方：添え書き ─────────────────────────────────────────

export function PrescribeDetails({
  result,
  input,
  onApply,
}: {
  result: AgentResult;
  input: string;
  onApply: (text: string) => void;
}) {
  const notes = result.cultures.filter((r) => frictionState(r) === "wording" && r.bridgeNote);
  const boundaries = result.cultures.filter((r) => frictionState(r) === "boundary");
  if (notes.length === 0 && boundaries.length === 0) return null;

  return (
    <Fold title="添え書き（原文は変えずに末尾へ）">
      {notes.map((r) => (
        <div key={r.culture} className="rounded border border-(--color-accent-a)/30 bg-(--color-accent-a)/8 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <CultureName culture={r.culture} />
            <div className="flex gap-1.5">
              <CopyButton text={r.bridgeNote!} />
              <button
                type="button"
                onClick={() => onApply(`${input}\n${r.bridgeNote}`)}
                className="shrink-0 rounded-md border border-(--color-line) bg-(--color-ink) px-2 py-1 text-[11px] text-(--color-muted) transition hover:text-(--color-fg)"
              >
                添え書きを付けて入力欄へ
              </button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed">{r.bridgeNote}</p>
        </div>
      ))}
      {boundaries.length > 0 && (
        <p className="text-[11px] leading-relaxed text-(--color-muted)">
          線引きのずれ（{boundaries.map((r) => CULTURES[r.culture].shortLabel).join("・")}）は、添え書きでは防げません。
          選択肢は ⑥ に出します。
        </p>
      )}
    </Fold>
  );
}

// ── ⑤ 検証：Before → After ───────────────────────────────────

export function VerifyDetails({ result }: { result: AgentResult }) {
  const { verified, skipped, verifier, mode } = result.agent;
  if (verified.length === 0 && skipped.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {verified.length > 0 && (
        <>
          <ul className="space-y-2">
            {verified.map((v) => (
              <RiskDelta key={v.culture} outcome={v} />
            ))}
          </ul>
          <p className="text-[10px] leading-relaxed text-(--color-muted)">
            {mode === "demo"
              ? "デモ再生：この値は事前に用意したもので、実測ではありません。"
              : `AIによる自己検証です（検証モデル：${verifier}）。元の文も修正後も同じ検証モデルが読んでおり、人手の検証ではありません。`}
          </p>
        </>
      )}
      {skipped.map((s) => (
        <p
          key={s.culture}
          className="rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-(--color-yellow)"
        >
          {CULTURES[s.culture].shortLabel}：未検証（{SKIP_REASON[s.reason]}）
        </p>
      ))}
    </div>
  );
}

// ── ⑥ 報告：人の判断 ─────────────────────────────────────────

export function ReportDetails({ result, onApply }: { result: AgentResult; onApply: (text: string) => void }) {
  const { handoff, verified } = result.agent;
  if (handoff.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* 説明は1回だけ。文化圏ごとに繰り返すと縦に長くなり、肝心の選択肢が埋もれる */}
      <p className="text-[11px] leading-relaxed text-(--color-muted)">
        言い方を直しても残る摩擦です。どちらが正しいかは判定しません。決めるのはあなたです。
      </p>
      {handoff.map((culture) => {
        const r = result.cultures.find((c) => c.culture === culture);
        if (!r) return null;
        const checked = verified.find((v) => v.culture === culture && v.candidate === "rewrite");
        const norm = citedNorms(r)[0];
        return (
          <div key={culture} className="rounded-lg border border-(--color-accent-b)/40 bg-(--color-accent-b)/8 px-3 py-2">
            <div className="flex items-center gap-2">
              <CultureName culture={culture} />
              <FrictionBadge state="boundary" />
            </div>
            {norm && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-(--color-muted)">
                <span className="mr-1 font-mono text-(--color-fg)">#{norm.no}</span>
                {norm.text}
              </p>
            )}
            {r.rewrite && (
              <button
                type="button"
                onClick={() => onApply(r.rewrite!)}
                className="mt-2 rounded-md border border-(--color-accent-b)/50 bg-(--color-ink) px-2.5 py-1 text-[11px] font-semibold text-(--color-fg) transition hover:border-(--color-accent-b)"
              >
                言い換え案を入力欄へ
                {checked ? `（検証 ${checked.before.risk}→${checked.after.risk}）` : ""}
              </button>
            )}
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-(--color-muted)">そのまま出す／この文化圏には出さない、も選べます。</p>
    </div>
  );
}
