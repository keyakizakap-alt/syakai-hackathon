"use client";

import { useState } from "react";

import { CheckPanel } from "@/components/CheckPanel";
import { FilterPanel } from "@/components/FilterPanel";

type Tab = "out" | "in";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "out", label: "出国審査", icon: "🛫" },
  { id: "in", label: "入国審査", icon: "🛬" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("out");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel)/60 backdrop-blur">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-line) px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="accent-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
            >
              🛃
            </span>
            <div>
              <h1 className="text-base font-bold tracking-tight sm:text-lg">ニュアンス税関</h1>
              <p className="text-xs text-(--color-muted)">
                国境を越える言葉を、出る側と入る側の両方で検める
              </p>
            </div>
          </div>

          <div role="tablist" aria-label="審査の方向" className="flex gap-1 rounded-full border border-(--color-line) bg-(--color-ink) p-1">
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
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    active ? "accent-gradient text-white" : "text-(--color-muted) hover:text-(--color-fg)"
                  }`}
                >
                  <span aria-hidden>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* パネルは非表示時にアンマウントする。入力と結果を持ち越すと、タブを戻したとき
            「いま何を判定した結果なのか」が分からなくなるため。 */}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="px-6 py-6">
          {tab === "out" ? <CheckPanel /> : <FilterPanel />}
        </div>
      </div>

      <footer className="mt-6 px-1 text-xs leading-relaxed text-(--color-muted)">
        <p>
          🔒 このツールは削除も通報もしません。判定は本人にだけ返され、個人アカウントの分析・スコアリングは一切行いません。
          どの文化を「正しい」とも判定せず、前提の違いだけを示します。
          受信フィルタは偽陰性（警告の失効）が実害になるため、判断に迷う場合は必ず遮断側に倒します。
        </p>
      </footer>
    </main>
  );
}
