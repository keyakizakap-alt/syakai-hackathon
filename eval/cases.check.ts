import type { CultureId, Verdict } from "../lib/types";

/**
 * 出国審査（発信前チェック）のゴールドセット。
 *
 * 設計方針：
 * 1. **verdict の完全一致では採点しない。** green/yellow/red の境界は主観が入るため、
 *    「この文化圏では最低でも yellow 以上であるべき」という下限で採点する。
 * 2. **対照群（control）を必ず入れる。** 無害な文を green と判定できるかを測らないと、
 *    「全部 red と言えば満点」という無意味な評価になる。過剰警告こそが
 *    このツールを使われなくする最大の要因なので、偽陽性は独立に測る。
 * 3. **極性の読みは二値で客観採点する。** 「死んだ」を肯定と読めたかは主観が入らない。
 *    これがこのプロダクトの中核的な主張なので、独立した指標として切り出す。
 */

export type CheckCategory =
  /** 語の感情極性が180度反転する（このプロダクトの中核主張） */
  | "polarity_inversion"
  /** 語用論レベルの反転。衝突回避のための語が、直訳されると衝突を起こす */
  | "pragmatic_inversion"
  /** 同じ一文が文化によって美徳／違反に分かれる */
  | "culture_divergence"
  /** 警告表現そのものが国境で機能を失う */
  | "warning_evaporation"
  /** 無害な文。green と判定されるべき（偽陽性の測定用） */
  | "control";

export interface CheckCase {
  id: string;
  category: CheckCategory;
  text: string;
  /** なぜこの例が難しいのか。発表で読み上げる一行 */
  why: string;
  expect: {
    /**
     * 極性反転語を含む場合、その語を「肯定」として読めているべきか。
     * true なら、その語を根拠に red/yellow を付けるのは誤読。
     */
    polarityPositive?: boolean;
    /** 各文化圏で最低限このverdict以上であるべき（未指定の文化は採点しない） */
    minVerdict?: Partial<Record<CultureId, Verdict>>;
    /** すべての文化で green であるべき（control 用） */
    allGreen?: boolean;
    /** この2文化は判定が割れるべき（同じ一文が文化で意味を変える証拠） */
    mustDiverge?: [CultureId, CultureId][];
    /** 原文中のこの部分文字列が、いずれかの文化で trigger として検出されるべき */
    mustFlagSpans?: string[];
  };
}

export const CHECK_CASES: CheckCase[] = [
  // ── 極性反転 ────────────────────────────────────────────────
  {
    id: "pol-01",
    category: "polarity_inversion",
    text: "新衣装かわいすぎて死んだ💀 しんどい……もう無理……",
    why: "「死んだ」「しんどい」「無理」「💀」が全て最上級の肯定。機械翻訳は自傷・脅迫として着弾させる",
    expect: {
      polarityPositive: true,
      minVerdict: { en_ao3: "yellow" },
      mustFlagSpans: ["死んだ"],
    },
  },
  {
    id: "pol-02",
    category: "polarity_inversion",
    text: "今日のライブほんとにやばい。語彙力死ぬ。",
    why: "「やばい」「死ぬ」の二重の極性反転。文脈語が少なく判定が難しい",
    expect: { polarityPositive: true, minVerdict: { en_ao3: "yellow" } },
  },
  {
    id: "pol-03",
    category: "polarity_inversion",
    text: "尊すぎて泣いた。もう無理、語れない。",
    why: "「尊い」は英語に対応語がなく、「泣いた」「無理」が否定的に訳される",
    expect: { polarityPositive: true },
  },
  {
    id: "pol-04",
    category: "polarity_inversion",
    text: "awsl 这个舞台我真的哭了",
    why: "中国語圏の「awsl（啊我死了）」も同じ構造。中国語→英語でも極性が壊れる",
    expect: { polarityPositive: true },
  },
  {
    id: "pol-05",
    category: "polarity_inversion",
    text: "I'm literally dead 💀 this comeback killed me",
    why: "英語圏では肯定表現。日本語・韓国語へ機械翻訳すると文字通りの死として訳されうる（逆方向の反転）",
    expect: { polarityPositive: true },
  },

  // ── 語用論レベルの反転 ───────────────────────────────────────
  {
    id: "prag-01",
    category: "pragmatic_inversion",
    text: "この描写はわたしとは解釈違いかも。でもこれはこれで良いと思う！",
    why: "「解釈違い」は相手を否定しないために発明された衝突回避語。直訳の \"wrong interpretation\" は英語圏で最も嫌われる押し付けになり、機能が反転する",
    expect: {
      minVerdict: { en_ao3: "yellow" },
      mustFlagSpans: ["解釈違い"],
    },
  },
  {
    id: "prag-02",
    category: "pragmatic_inversion",
    text: "わたしは同担拒否なので、そこだけご理解ください。",
    why: "JP規範では「個人の立場表明であり排斥要求ではない」。英語圏では他ファンの排除宣言（gatekeeping）と読まれうる",
    expect: {
      minVerdict: { en_ao3: "yellow" },
      mustDiverge: [["jp_doujin", "en_ao3"]],
    },
  },
  {
    id: "prag-03",
    category: "pragmatic_inversion",
    text: "たぶんこの解釈が正しいような気がするんだけど、どうかな",
    why: "JPでは断定を避ける語尾が丁寧さの signal。機械翻訳が「〜かも」を落として断定文にすると、EN規範で最も高圧的とされる三人称の断定になる",
    expect: { minVerdict: { en_ao3: "yellow" } },
  },

  // ── 文化で判定が割れる ──────────────────────────────────────
  {
    id: "div-01",
    category: "culture_divergence",
    text: "誕生日広告を渋谷駅に出します！ 一口500円でカンパ募集中です。DMください。",
    why: "ZH圏では組織的な集金・データ支援が推奨される規範。EN圏では投げ銭導線が grifting と読まれる。JP圏では課金額の開示が忌避される。三者三様に割れる",
    expect: {
      minVerdict: { en_ao3: "yellow" },
      mustDiverge: [["zh_weibo", "en_ao3"]],
    },
  },
  {
    id: "div-02",
    category: "culture_divergence",
    text: "中の人の前世の話、まとめておきました。",
    why: "JP規範では「演者の世界観を壊す」強いタブー。他文化圏にはこの規範自体が存在せず、判定が割れるべき",
    expect: {
      minVerdict: { jp_doujin: "yellow" },
      mustFlagSpans: ["中の人"],
    },
  },
  {
    id: "div-03",
    category: "culture_divergence",
    text: "公式アカウントにこの二次創作見てほしいのでリプ送りました！",
    why: "JP規範では二重のタブー（公式への直接リプライ＋公式に二次創作を見せる）。EN圏ではこの規範が弱く、判定が割れる",
    expect: {
      minVerdict: { jp_doujin: "yellow" },
      mustDiverge: [["jp_doujin", "en_ao3"]],
    },
  },
  {
    id: "div-04",
    category: "culture_divergence",
    text: "세츠 진짜 귀엽다 ㅋㅋ",
    why: "KR規範では対象への敬称・敬語階層が厳格。敬称を欠いた言及は他文化圏では無害でもKR圏で問題化しうる",
    expect: { minVerdict: { kr_fancafe: "yellow" } },
  },
  {
    id: "div-05",
    category: "culture_divergence",
    text: "チケット余ったので定価より少し上で譲ります。",
    why: "JP規範では定価超えの譲渡は強い規範違反で、言及の仕方だけで炎上要因。全文化で問題だが重みが違う",
    expect: {
      minVerdict: { jp_doujin: "red", en_ao3: "yellow" },
      mustFlagSpans: ["定価"],
    },
  },

  // ── 警告の越境失効 ──────────────────────────────────────────
  {
    id: "warn-01",
    category: "warning_evaporation",
    text: "監禁ネタの新作を置いておきます。地雷の方はご注意ください。",
    why: "「地雷」が \"landmine\" と直訳されると警告として機能しなくなる。EN規範ではCW/TWの明示が義務に近く、曖昧な警告は倫理違反として扱われる",
    expect: {
      minVerdict: { en_ao3: "yellow" },
      mustFlagSpans: ["地雷"],
    },
  },
  {
    id: "warn-02",
    category: "warning_evaporation",
    text: "※重めの描写を含みます。苦手な方は回れ右でお願いします。",
    why: "日本語圏特有の曖昧警告。EN圏なら CW: の後に具体名を列挙すべき題材が「重め」の一語に圧縮され、越境すると何の警告にもならない",
    expect: { minVerdict: { en_ao3: "yellow" } },
  },
  {
    id: "warn-03",
    category: "warning_evaporation",
    text: "지뢰 주의. 감금 묘사 있습니다.",
    why: "韓国語の「지뢰」は借用語で定着度が低く、韓国語圏内でも警告として弱い。越境するとさらに失効する",
    expect: { minVerdict: { en_ao3: "yellow" } },
  },

  // ── 対照群（green であるべき。偽陽性の測定用）───────────────
  {
    id: "ctl-01",
    category: "control",
    text: "今日は新しいアルバムを聴きながら散歩してきました。天気が良くて気持ちよかったです。",
    why: "完全に無害な日常投稿。これを警告するようなら過剰警告で、ツールとして使われなくなる",
    expect: { allGreen: true },
  },
  {
    id: "ctl-02",
    category: "control",
    text: "ライブの円盤、来月発売だそうです。予約開始は明日の10時からとのこと。",
    why: "事実の告知のみ。固有名詞も感情語も無い",
    expect: { allGreen: true },
  },
  {
    id: "ctl-03",
    category: "control",
    text: "The new album drops next Friday. Pre-orders are open on the official site.",
    why: "英語の事務的な告知。逆方向でも過剰警告しないことを確認する",
    expect: { allGreen: true },
  },
  {
    id: "ctl-04",
    category: "control",
    text: "みんなでごはん食べてる話を書きました。ほのぼのです。",
    why: "「ほのぼの」タグ相当の無害な創作告知。warning_evaporation と混同して警告しないか",
    expect: { allGreen: true },
  },
];

/** 極性反転語を含み、肯定と読めるべきケース（中核主張の指標） */
export const POLARITY_CASES = CHECK_CASES.filter((c) => c.expect.polarityPositive);

/** 偽陽性測定用の対照群 */
export const CONTROL_CASES = CHECK_CASES.filter((c) => c.category === "control");
