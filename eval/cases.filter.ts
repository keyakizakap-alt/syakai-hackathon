import type { FilterDecision } from "../lib/types";

/**
 * 入国審査（受信フィルタ）のゴールドセット。
 *
 * このフィルタは**偽陰性が致命的**（遮断すべきものを通すと、読者は避けたかった
 * ものを踏む）。逆に偽陽性は「解除して読めばよい」だけで実害が小さい。
 * したがって採点も非対称に行う：
 * - 偽陰性（must_block を通した）＝ 重大な失敗として別枠で数える
 * - 偽陽性（must_pass を遮断した）＝ 使い勝手の劣化として別枠で数える
 * この2つを1つの「正答率」に混ぜると、非対称性が消えて評価の意味が失われる。
 */

export interface FilterCase {
  id: string;
  declaration: string;
  why: string;
  /** 必ず block されるべき作品ID（通したら偽陰性＝重大な失敗） */
  mustBlock: string[];
  /** 必ず pass されるべき作品ID（遮断したら偽陽性＝過剰遮断） */
  mustPass: string[];
  /** block でも warn でも可（判断が分かれてよい作品） */
  allowEither?: string[];
  /**
   * このケースで、単語一致では到達できない作品ID。
   * ベースラインとの差分を示す中核証拠になる。
   */
  semanticOnly?: string[];
}

/** 許容される判定かを判定する（mustBlock は warn も不可＝確実に止めるべき） */
export function isAcceptable(expected: "block" | "pass", actual: FilterDecision): boolean {
  return expected === "block" ? actual === "block" : actual === "pass";
}

export const FILTER_CASES: FilterCase[] = [
  {
    id: "flt-01",
    declaration: "登場人物が閉じ込められる話が無理です。あと救いのない終わり方も避けたい。",
    why: "このアプリの中核ケース。監禁題材は4言語圏すべてに存在するが、日本語作品 w09『解けない鎖』だけはタグにも警告にも該当語が一切なく、あらすじの意味からしか判定できない",
    mustBlock: ["w01", "w02", "w06", "w07", "w09"],
    mustPass: ["w03", "w08", "w11"],
    allowEither: ["w04", "w05", "w10", "w12"],
    // w09: タグ「リクセツ/シリアス/夢オチではない」警告「※重めの描写を含みます」
    //      → 「監禁」「閉じ込め」の語が一度も出てこない
    // w06: 中国語の「监禁」は日本語の「監禁」と字体が異なり、単純一致では引けない
    // w07: 韓国語の「감금」も同様
    semanticOnly: ["w06", "w07", "w09"],
  },
  {
    id: "flt-02",
    declaration: "バッドエンドが苦手。ハッピーエンドだと分かっているものだけ読みたいです。",
    why: "結末の型は英語圏では明示タグ、日本語圏では「ハピエン」、中国語圏では「HE」「无HE」と表記が全く異なる。表記ゆれを跨げるか",
    mustBlock: ["w06", "w07"],
    mustPass: ["w02", "w03", "w11"],
    allowEither: ["w01", "w04", "w05", "w08", "w09", "w10", "w12"],
    semanticOnly: ["w06", "w07"],
  },
  {
    id: "flt-03",
    declaration: "パニック発作や過呼吸の描写がだめです。",
    why: "英語圏は panic attacks を CW に明示する規範があるため単語一致で引ける。一方、同じ題材を扱う日本語・韓国語作品は宣言していないため、あらすじからの推論が必要",
    mustBlock: ["w01", "w12"],
    mustPass: ["w03", "w08", "w11"],
    allowEither: ["w02", "w05", "w06", "w07", "w09", "w10"],
  },
  {
    id: "flt-04",
    declaration: "別れ話とか、関係が壊れる話は今は読みたくない。",
    why: "「破镜难圆」（中）「relationship breakdown」（英）は同じ概念の別表記。日本語の宣言から両方に届くか",
    mustBlock: ["w05", "w10"],
    mustPass: ["w03", "w08", "w11"],
    allowEither: ["w01", "w02", "w04", "w06", "w07", "w09", "w12"],
    semanticOnly: ["w05"],
  },
  {
    id: "flt-05",
    declaration: "重い話は全部無理です。ほのぼのしたものだけ読みたい。",
    why: "肯定形の宣言（「〜だけ読みたい」）。否定形の宣言より抽出が難しく、かつ広く遮断する必要がある。安全側バイアスが働くか",
    mustBlock: ["w01", "w06", "w07", "w09"],
    mustPass: ["w03", "w08", "w11"],
    allowEither: ["w02", "w04", "w05", "w10", "w12"],
    semanticOnly: ["w09"],
  },
  {
    id: "flt-06",
    declaration: "強制的な展開、同意のない関係性が苦手です。",
    why: "中国語の「强制」は明示タグ。日本語圏には対応する定型タグが存在せず、あらすじからの判断になる",
    mustBlock: ["w06"],
    mustPass: ["w03", "w08", "w11"],
    allowEither: ["w01", "w02", "w04", "w05", "w07", "w09", "w10", "w12"],
  },
  {
    id: "flt-07",
    declaration: "ネタバレが嫌なので、後日談や完結後の話は避けたいです。",
    why: "危険題材ではない普通の選好。安全性とは無関係な宣言でも正しく機能するか（過剰遮断していないかの確認）",
    mustBlock: ["w11"],
    mustPass: ["w03", "w08"],
    allowEither: ["w01", "w02", "w04", "w05", "w06", "w07", "w09", "w10", "w12"],
  },
  {
    id: "flt-08",
    declaration: "特にありません。全部読みたいです。",
    why: "空に近い宣言。何も遮断すべきでない。ここで遮断が出るなら安全側バイアスが効きすぎている",
    mustBlock: [],
    mustPass: ["w01", "w02", "w03", "w04", "w05", "w06", "w07", "w08", "w09", "w10", "w11", "w12"],
  },
];
