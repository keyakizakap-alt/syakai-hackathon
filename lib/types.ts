export const CULTURE_IDS = ["jp_doujin", "en_ao3", "kr_fancafe", "zh_weibo"] as const;
export type CultureId = (typeof CULTURE_IDS)[number];

/** 信号機。green=問題なし / yellow=誤読リスク / red=炎上リスク */
export type Verdict = "green" | "yellow" | "red";

/** 逆翻訳で独立に採点する4次元。単純な類似度では極性反転を見逃すため分けている。 */
export type DriftDimension = "polarity" | "register" | "entities" | "negation";

export interface Trigger {
  /** 原文中の該当箇所。原文に現れる部分文字列であること。 */
  span: string;
  /** なぜその文化で引っかかるのか */
  why: string;
}

export interface CultureReading {
  culture: CultureId;
  verdict: Verdict;
  /** 0-100。高いほど誤読・炎上のリスクが大きい */
  risk: number;
  /** その文化圏の読者にはこう読める、という一人称の読み */
  reading: string;
  triggers: Trigger[];
  /** その文化向けの言い換え。問題がなければ null */
  rewrite: string | null;
}

export interface BackTranslation {
  culture: CultureId;
  /** その言語への訳 */
  translation: string;
  /** 原語に戻したもの */
  backTranslation: string;
  /** 各次元の「保存度」0-100。低いほど壊れている */
  dimensions: Record<DriftDimension, number>;
  /** 何がどう失われたか。保存できていれば null */
  drift: string | null;
}

export interface GlossaryHit {
  term: string;
  polarity: "positive" | "negative" | "neutral";
  /** 1-5。感情の強度 */
  intensity: number;
  meaning: string;
  commonMistranslation: string;
  /** 機械翻訳に通したときに何が起きるか */
  danger: string;
}

export interface CheckResult {
  input: string;
  overall: Verdict;
  /** 用語集の完全一致ヒット。few-shot に動的注入したもの */
  glossaryHits: GlossaryHit[];
  cultures: CultureReading[];
  backTranslations: BackTranslation[];
  /** live = 実際にLLMを呼んだ / demo = APIキー未設定でプリセット応答 */
  mode: "live" | "demo";
  /** 解析にかかった時間(ms) */
  elapsedMs: number;
}

export interface CultureMeta {
  id: CultureId;
  label: string;
  shortLabel: string;
  language: string;
  /** 文化圏の識別色。判定の信号色(緑/黄/赤)と混同されないよう別系統から選ぶ */
  accent: string;
}

export const CULTURES: Record<CultureId, CultureMeta> = {
  jp_doujin: {
    id: "jp_doujin",
    label: "日本語圏 同人・ヲタク圏",
    shortLabel: "JP 同人圏",
    language: "日本語",
    accent: "#b07fd8",
  },
  en_ao3: {
    id: "en_ao3",
    label: "英語圏 Tumblr / AO3 圏",
    shortLabel: "EN AO3圏",
    language: "English",
    accent: "#5a9fe0",
  },
  kr_fancafe: {
    id: "kr_fancafe",
    label: "韓国語圏 ファンカフェ圏",
    shortLabel: "KR ファンカフェ",
    language: "한국어",
    accent: "#4dc0b5",
  },
  zh_weibo: {
    id: "zh_weibo",
    label: "中国語圏 微博超话圏",
    shortLabel: "CN 超话圏",
    language: "简体中文",
    accent: "#d67bb0",
  },
};
