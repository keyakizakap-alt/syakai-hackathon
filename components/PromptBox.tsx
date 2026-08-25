"use client";

interface Preset {
  id: string;
  label: string;
  hook: string;
  text: string;
}

/**
 * プリセット＋入力欄＋送信ボタン。出国審査と入国審査で共通。
 *
 * ゼロから入力させると何を打てばよいか分からず体験が滑るため、プリセットを必ず入口に置く。
 */
export function PromptBox({
  presets,
  value,
  onChange,
  onSubmit,
  loading,
  maxChars,
  placeholder,
  submitLabel,
  loadingLabel,
  stale,
}: {
  presets: Preset[];
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  loading: boolean;
  maxChars: number;
  placeholder: string;
  submitLabel: string;
  loadingLabel: string;
  /** 結果表示中に入力が編集され、結果が現在の入力と食い違っている */
  stale: boolean;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onChange(p.text);
              onSubmit(p.text);
            }}
            disabled={loading}
            title={p.hook}
            className="rounded-full border border-(--color-line) bg-(--color-panel) px-3 py-1.5 text-xs text-(--color-muted) transition hover:border-(--color-muted) hover:text-(--color-fg) disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <label htmlFor="promptbox" className="sr-only">
        {placeholder}
      </label>
      <textarea
        id="promptbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter で送信。改行を頻繁に使う入力なので Enter 単体は割り当てない
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit(value);
          }
        }}
        rows={4}
        maxLength={maxChars}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-(--color-muted)/60 focus:border-(--color-muted)"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-(--color-muted)">
          {value.length} / {maxChars}
          <span className="ml-3 hidden sm:inline">⌘/Ctrl + Enter</span>
        </span>
        <button
          type="button"
          onClick={() => onSubmit(value)}
          disabled={loading || value.trim().length === 0}
          className="rounded-lg bg-(--color-fg) px-5 py-2 text-sm font-semibold text-(--color-ink) transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? loadingLabel : submitLabel}
        </button>
      </div>

      {stale && !loading && (
        <p className="mt-2 rounded border border-(--color-yellow)/30 bg-(--color-yellow)/8 px-3 py-2 text-xs text-(--color-yellow)">
          入力が変更されています。下の結果は編集前のものです。
        </p>
      )}
    </section>
  );
}
