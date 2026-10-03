import { NORM_CARDS } from "./norms";
import { stripInvisible } from "./prompts";
import type { CultureId, CultureReading, FrictionKind } from "./types";

/**
 * 摩擦の分類。**すべて決定的な純関数**で、LLMには分類させない。
 *
 * モデルが返すのは「どの規範カードを根拠にしたか」の番号だけで、種別（言い方／線引き）は
 * norms.ts に書いてある静的な分類から導く。これにより
 * - 同じ入力と同じ番号なら必ず同じ分類になる（再現できる）
 * - 番号が範囲外・重複でも壊れない（検証できる）
 * - モデルが「線引きなのに添え書きで解決できる」と言い張っても通らない
 */

/** 根拠として採用する規範番号の上限。多いほど「何でも当てはまる」ことになり根拠にならない */
const MAX_REFS = 3;
/** 添え書きの上限。投稿の末尾に足す一言であり、長文の解説にしない */
const MAX_NOTE_CHARS = 200;

/**
 * モデルが返した規範番号を、実在するものだけに絞る。
 * 範囲外・小数・重複は捨てる。順序はモデルが返した順（最も効いた規範が先）を保つ。
 */
export function cleanNormRefs(raw: readonly number[] | undefined, culture: CultureId): number[] {
  if (!raw) return [];
  const max = NORM_CARDS[culture].length;
  const out: number[] = [];
  for (const n of raw) {
    if (!Number.isInteger(n) || n < 1 || n > max) continue;
    if (out.includes(n)) continue;
    out.push(n);
    if (out.length >= MAX_REFS) break;
  }
  return out;
}

export interface CitedNorm {
  /** 1始まりの番号（その文化圏のカード内） */
  no: number;
  text: string;
  kind: FrictionKind;
}

/**
 * 判定が根拠にした規範の本文付きリスト。
 * 保存済み・手書きのデータでも安全なよう、ここでも番号を検証し直す。
 */
export function citedNorms(reading: Pick<CultureReading, "culture" | "normRefs">): CitedNorm[] {
  return cleanNormRefs(reading.normRefs, reading.culture).map((no) => {
    const norm = NORM_CARDS[reading.culture][no - 1];
    return { no, text: norm.text, kind: norm.kind };
  });
}

/**
 * 根拠にした規範の種別。1つでも線引きなら線引き（言い方を直しても残るため）。
 * 根拠が引けなかった場合は null。
 */
export function frictionOf(reading: Pick<CultureReading, "culture" | "normRefs">): FrictionKind | null {
  const norms = citedNorms(reading);
  if (norms.length === 0) return null;
  return norms.some((n) => n.kind === "boundary") ? "boundary" : "wording";
}

/**
 * 添え書きの正規化。
 *
 * - 言い方のずれにだけ出す。線引きのずれでは注釈で防げず、出すと「橋渡しできる」と誤認させる。
 * - 利用者はこれをコピーして自分の投稿に貼る。不可視・双方向制御文字が混ざっていると、
 *   本人が気づかないまま投稿に紛れ込むため除去する（プロンプトインジェクション経由の混入対策）。
 *   ZWJ は絵文字の連結に使われるので残る（stripInvisible の仕様）。
 * - 長さは code point 単位で切る。UTF-16 単位だと 💀 のようなサロゲートペアの途中で切れて化ける。
 */
export function normalizeBridgeNote(
  note: string | null | undefined,
  kind: FrictionKind | null,
): string | null {
  if (kind !== "wording") return null;
  const text = stripInvisible(note ?? "").trim();
  if (!text) return null;
  const chars = [...text];
  return chars.length > MAX_NOTE_CHARS ? chars.slice(0, MAX_NOTE_CHARS).join("") : text;
}

/**
 * モデル出力から、根拠の規範番号と添え書きを取り出して検証・正規化する。
 * analyze.ts の組み立て箇所はこれを展開するだけにして、判断をここ（テスト可能な純関数）に集める。
 *
 * green には添え書きを付けない。直す必要がないものに「橋渡し」を提案すると、問題があるように見せてしまう。
 */
export function frictionFields(
  culture: CultureId,
  verdict: CultureReading["verdict"],
  raw: { norm_refs: readonly number[]; bridge_note: string | null },
): Pick<CultureReading, "normRefs" | "bridgeNote"> {
  const normRefs = cleanNormRefs(raw.norm_refs, culture);
  const kind = verdict === "green" ? null : frictionOf({ culture, normRefs });
  return { normRefs, bridgeNote: normalizeBridgeNote(raw.bridge_note, kind) };
}

/**
 * 1文化圏の状態。
 * - unjudged：判定を取得できなかった。未検査であり、安全とは見なせない
 * - clean：green。摩擦のもとは検出されなかった（「安全」とは言わない）
 * - wording / boundary：green 以外で、根拠の規範から種別が決まった
 * - unclassified：green 以外だが規範カードに根拠が引けなかった（逆翻訳ゲートで昇格した等）
 *
 * green のときは根拠を引いていても摩擦とは数えない（「この表現は問題ない」の根拠にも規範は使われる）。
 */
export type FrictionState = "unjudged" | "clean" | "wording" | "boundary" | "unclassified";

export function frictionState(reading: CultureReading): FrictionState {
  if (reading.unjudged) return "unjudged";
  if (reading.verdict === "green") return "clean";
  return frictionOf(reading) ?? "unclassified";
}

export type FrictionSummary = Record<FrictionState, number>;

export function summarizeFriction(readings: readonly CultureReading[]): FrictionSummary {
  const summary: FrictionSummary = { unjudged: 0, clean: 0, wording: 0, boundary: 0, unclassified: 0 };
  for (const r of readings) summary[frictionState(r)]++;
  return summary;
}
