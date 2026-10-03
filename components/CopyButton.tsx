"use client";

import { useState } from "react";

/** クリップボードへコピーするボタン。出国審査の言い換え案と、エージェントの添え書きで共用する */
export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard 権限がない環境ではボタンを無反応にするだけに留める
        }
      }}
      className="shrink-0 rounded-md border border-(--color-line) bg-(--color-ink) px-2 py-1 text-[11px] text-(--color-muted) transition hover:text-(--color-fg)"
    >
      {copied ? "コピーしました" : label}
    </button>
  );
}
