import { lookupGlossary } from "../lib/glossary";
import { WORKS } from "../lib/works";
import type { FilterDecision } from "../lib/types";

/**
 * 比較対象となる「安い手法」の実装。LLMを一切呼ばないため、APIキー無しで実測できる。
 *
 * ここでの目的は自分に有利な藁人形を作ることではない。むしろ**ベースラインには
 * 有利に倒す**（n-gram を細かく取る、あらすじまで検索対象に含める版も用意する）。
 * それでも越えられない壁があることを示すのが、このプロダクトの存在証明になる。
 */

// ── 文字列マッチ系ベースライン（入国審査の比較対象）────────────────

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

/**
 * 宣言文から検索語の候補を切り出す。
 *
 * 形態素解析器を入れずに済ませつつ、ベースラインに不利にならないよう
 * **CJKは2〜4文字のn-gramを総当たりで生成する**（辞書なしで取りうる最も
 * 網羅的な方法）。ラテン文字は空白区切りの語をそのまま使う。
 */
export function extractTerms(declaration: string): string[] {
  const terms = new Set<string>();

  // ラテン文字の語（3文字以上）
  for (const m of declaration.matchAll(/[A-Za-z]{3,}/g)) {
    terms.add(m[0].toLowerCase());
  }

  // CJKの連続領域から2〜4文字のn-gramを生成
  for (const run of declaration.split(/[^぀-ヿ㐀-鿿가-힯]+/)) {
    if (!run || !CJK.test(run)) continue;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        terms.add(run.slice(i, i + n));
      }
    }
  }

  // 純粋な機能語のみ落とす。「無理」「苦手」のような内容語は、ベースラインを
  // 不当に弱く見せないため**あえて残す**（評価の弁護可能性のため）。
  const STOP = new Set(["です", "ます", "ました", "ので", "から", "けど", "こと", "もの"]);
  return [...terms].filter((t) => !STOP.has(t));
}

export type BaselineName = "tag_only" | "tag_and_summary";

/**
 * 文字列一致による遮断判定。
 *
 * - tag_only: タグと作者宣言警告のみを検索対象にする（実在のタグブロック機能に相当）
 * - tag_and_summary: あらすじ・タイトルも含めて全文検索する（より強いベースライン）
 */
export function baselineFilter(declaration: string, mode: BaselineName): Map<string, FilterDecision> {
  const terms = extractTerms(declaration);
  const out = new Map<string, FilterDecision>();

  for (const w of WORKS) {
    const haystack = (
      mode === "tag_only"
        ? [...w.tags, ...w.declaredWarnings]
        : [...w.tags, ...w.declaredWarnings, w.title, w.summary]
    )
      .join(" ")
      .toLowerCase();

    const hit = terms.some((t) => haystack.includes(t.toLowerCase()));
    out.set(w.id, hit ? "block" : "pass");
  }
  return out;
}

// ── 辞書ベースライン（出国審査の比較対象）──────────────────────

export interface GlossaryBaselineResult {
  /** 用語集に完全一致した語 */
  hits: string[];
  /** 辞書だけで何らかの判定信号が得られたか */
  hasSignal: boolean;
}

/**
 * 用語集の完全一致のみによる判定。
 *
 * 辞書は「既知語の極性」には強い。弱いのは、辞書に無い語・文脈依存・
 * そして**文化圏ごとの規範の違い**（辞書は「同担拒否がEN圏でどう読まれるか」を
 * 表現できない）。どのケースで信号がゼロになるかを数えるのが目的。
 */
export function baselineGlossary(text: string): GlossaryBaselineResult {
  const hits = lookupGlossary(text).map((h) => h.term);
  return { hits, hasSignal: hits.length > 0 };
}
