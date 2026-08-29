"use client";

import { useState } from "react";

import { CheckPanel } from "@/components/CheckPanel";
import { FilterPanel } from "@/components/FilterPanel";

type Tab = "out" | "in";

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "out", label: "出国審査", sub: "発信前チェック" },
  { id: "in", label: "入国審査", sub: "受信フィルタ" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("out");

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ニュアンス税関</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          国境を越える言葉を、出る側と入る側の両方で検める。
        </p>
      </header>

      <div role="tablist" aria-label="審査の方向" className="mb-6 flex gap-1 border-b border-(--color-line)">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-left transition ${
                active
                  ? "border-(--color-fg) text-(--color-fg)"
                  : "border-transparent text-(--color-muted) hover:text-(--color-fg)"
              }`}
            >
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className="block text-xs text-(--color-muted)">{t.sub}</span>
            </button>
          );
        })}
      </div>

      {/* パネルは非表示時にアンマウントする。入力と結果を持ち越すと、タブを戻したとき
          「いま何を判定した結果なのか」が分からなくなるため。 */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "out" ? <CheckPanel /> : <FilterPanel />}
      </div>

      <footer className="mt-12 border-t border-(--color-line) pt-5 text-xs leading-relaxed text-(--color-muted)">
        <p>
          このツールは削除も通報もしません。判定は本人にだけ返され、個人アカウントの分析・スコアリングは一切行いません。
          どの文化を「正しい」とも判定せず、前提の違いだけを示します。
          受信フィルタは偽陰性（警告の失効）が実害になるため、判断に迷う場合は必ず遮断側に倒します。
        </p>
      </footer>
    </main>
  );
}
