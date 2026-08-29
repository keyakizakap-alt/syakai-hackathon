import type { GlossaryHit } from "./types";

export interface GlossaryEntry extends GlossaryHit {
  /** 表記ゆれ。完全一致検索の対象に含める */
  aliases: string[];
  /** true のとき、機械翻訳で極性が反転する最危険クラス */
  polarityTrap: boolean;
}

/**
 * ファンダム語彙集。
 *
 * 全語彙をプロンプトに詰めると原文と無関係な語まで文脈を汚すので、
 * 完全一致でヒットしたものだけを few-shot として動的注入する（lookupGlossary）。
 * 使うほど育つ資産として設計している。
 */
export const GLOSSARY: GlossaryEntry[] = [
  // ── 極性反転トラップ（機械翻訳が最も壊す最危険クラス）─────────────
  {
    term: "しんどい",
    aliases: ["しんど", "シンドイ"],
    polarity: "positive",
    intensity: 5,
    meaning: "良すぎて心臓と情緒が耐えられない、という最上級の肯定。",
    commonMistranslation: "I'm exhausted / it's tough",
    danger: "極性が180度反転し、海外ファンに『失望している』と読まれる。心配・擁護ツイートが飛び交う事故が定期的に起きる。",
    polarityTrap: true,
  },
  {
    term: "無理",
    aliases: ["むり", "ムリ"],
    polarity: "positive",
    intensity: 5,
    meaning: "情報量が多すぎて処理できない＝最高、という肯定。",
    commonMistranslation: "It's impossible / I can't",
    danger: "拒絶・否定として読まれ、賞賛が批判に化ける。",
    polarityTrap: true,
  },
  {
    term: "死んだ",
    aliases: ["死ぬ", "しんだ", "living", "死亡"],
    polarity: "positive",
    intensity: 5,
    meaning: "衝撃で機能停止した＝最高だった、という肯定。",
    commonMistranslation: "I want to die / died",
    danger: "自傷・脅迫の文脈に読まれうる。特に絵文字💀と併用すると英語圏で脅迫と解釈される。",
    polarityTrap: true,
  },
  {
    term: "やばい",
    aliases: ["ヤバい", "やば", "ヤバ"],
    polarity: "positive",
    intensity: 4,
    meaning: "文脈依存だが、推し活文脈ではほぼ常に最上級の肯定。",
    commonMistranslation: "dangerous / terrible",
    danger: "危険・劣悪の意味に固定され、賞賛が警告に変わる。",
    polarityTrap: true,
  },
  {
    term: "尊い",
    aliases: ["とうとい", "トウトイ", "尊すぎ"],
    polarity: "positive",
    intensity: 5,
    meaning: "美しさに打ちのめされ、言語処理が破綻したときに漏れる悲鳴。褒め言葉ではなく感嘆の絶叫。",
    commonMistranslation: "precious / noble / sacred",
    danger: "形容詞に落とされることで発話の身体性（叫び）が消える。真顔で noble と訳された投稿は宗教的賛美に見える。",
    polarityTrap: false,
  },
  {
    term: "草",
    aliases: ["くさ", "w", "ｗ", "www"],
    polarity: "positive",
    intensity: 3,
    meaning: "笑い。www の視覚化。",
    commonMistranslation: "grass",
    danger: "翻訳器が植物として訳すか、記号として素通りして温度が消える。",
    polarityTrap: false,
  },
  {
    term: "💀",
    aliases: ["I'm dead", "im dead", "I died"],
    polarity: "positive",
    intensity: 4,
    meaning: "英語圏ファンダムでは爆笑の記号。日本語圏の「草」に相当。",
    commonMistranslation: "（記号なので翻訳されず素通りする）",
    danger: "翻訳の失敗ではなく翻訳の不在による事故。受信側の文化コードで『死・不吉・脅迫』として再解釈される。",
    polarityTrap: true,
  },
  {
    term: "awsl",
    aliases: ["啊我死了"],
    polarity: "positive",
    intensity: 5,
    meaning: "可愛すぎて死んだ。中国語圏における「尊い」に相当する最上級の肯定。",
    commonMistranslation: "（ローマ字のまま放置される／「私は死んだ」と直訳される）",
    danger: "中韓→英→日の英語ピボット翻訳を通ると二重に壊れる。",
    polarityTrap: true,
  },

  // ── 規範語（訳語の選択が対人関係を壊すクラス）─────────────────
  {
    term: "解釈違い",
    aliases: ["かいしゃくちがい"],
    polarity: "neutral",
    intensity: 3,
    meaning: "どちらも正しいが、自分の解釈とは異なる。相手を非難しないために発明された高度な衝突回避語。",
    commonMistranslation: "misinterpretation / wrong interpretation",
    danger: "wrong と訳された瞬間に衝突回避語が衝突誘発語に反転する。同人文化が数十年かけて磨いた社会技術が翻訳一発で消える。",
    polarityTrap: true,
  },
  {
    term: "地雷",
    aliases: ["じらい", "地雷CP", "地雷カプ"],
    polarity: "negative",
    intensity: 4,
    meaning: "(a) 見ると精神的ダメージを受ける、自分にとって受け入れられない要素。(b) 地雷系＝ファッション／情緒の美学ジャンル。",
    commonMistranslation: "landmine",
    danger: "英語圏の等価概念は (a) squick / NOTP / hard no と (b) menhera aesthetic でまったく別語。一語に潰されると(a)の警告文が(b)と読まれ、警告として機能しなくなる＝実害。",
    polarityTrap: false,
  },
  {
    term: "同担拒否",
    aliases: ["どうたんきょひ"],
    polarity: "neutral",
    intensity: 3,
    meaning: "同じ推しを応援する他ファンとの交流を望まないという個人の立場表明。",
    commonMistranslation: "refusing the same charge / rejecting fellow fans",
    danger: "西欧圏には相当概念がほぼ無く、『排他的で感じ悪い人』と誤認されて国際的な衝突の火種になる。",
    polarityTrap: false,
  },
  {
    term: "担降り",
    aliases: ["たんおり", "担降"],
    polarity: "neutral",
    intensity: 2,
    meaning: "応援対象をグループ内の別メンバーに変えること。および、それに伴う罪悪感の文化。",
    commonMistranslation: "getting off the person in charge",
    danger: "K-pop の bias wrecker は罪悪感がなくネタとして楽しむため、規範ごと誤って伝わる。",
    polarityTrap: false,
  },
  {
    term: "영업",
    aliases: ["ヨンオプ", "yeongeop"],
    polarity: "positive",
    intensity: 3,
    meaning: "布教・沼への勧誘。韓国語圏の肯定的な行為。",
    commonMistranslation: "sales / business（営業）",
    danger: "「営業」と訳された布教投稿がステマ疑惑を生む。",
    polarityTrap: true,
  },
  {
    term: "墙头",
    aliases: ["qiangtou"],
    polarity: "neutral",
    intensity: 2,
    meaning: "あちこちに推しがいて心が移ろう状態。中立語。",
    commonMistranslation: "wall top",
    danger: "直訳が無意味になるか、不誠実さの非難として読まれる。",
    polarityTrap: false,
  },
  {
    term: "comeback",
    aliases: ["カムバ", "カムバック", "컴백"],
    polarity: "neutral",
    intensity: 2,
    meaning: "単なる新譜リリース活動期。休止も引退もしていない。",
    commonMistranslation: "復帰 / 返り咲き",
    danger: "「復帰」と訳されたことで『え、活動休止してたの？』というデマが日本語圏に流れる。",
    polarityTrap: false,
  },
  {
    term: "delulu",
    aliases: ["デルル"],
    polarity: "positive",
    intensity: 3,
    meaning: "自嘲を含んだ愛のある自虐。病理的な意味はない。",
    commonMistranslation: "妄想（病理的な語彙として）",
    danger: "病理語に訳すと自虐が侮辱に変わる。",
    polarityTrap: true,
  },
  {
    term: "stan",
    aliases: ["スタン"],
    polarity: "neutral",
    intensity: 3,
    meaning: "ニュートラルな「ガチ勢」。現在は蔑称ではない。",
    commonMistranslation: "熱狂的支持者（ストーカー語感を伴って）",
    danger: "語源のストーカー的含意が残る訳語を当てると、自称が侮辱に変わる。",
    polarityTrap: false,
  },
  {
    term: "推し",
    aliases: ["おし", "oshi", "最推し", "推しごと"],
    polarity: "positive",
    intensity: 4,
    meaning: "応援する対象。英語圏でも oshi として借用語化が進んでおり、訳さない方がよい。",
    commonMistranslation: "favorite / idol",
    danger: "favorite と訳すと能動的に押し上げる（推す）という行為性が消える。",
    polarityTrap: false,
  },
  {
    term: "供給",
    aliases: ["きょうきゅう"],
    polarity: "positive",
    intensity: 3,
    meaning: "公式から提供される新しいコンテンツ。",
    commonMistranslation: "supply（経済用語として）",
    danger: "サプライチェーン用語として訳され、文が意味不明になる。",
    polarityTrap: false,
  },
  {
    term: "解釈",
    aliases: [],
    polarity: "neutral",
    intensity: 2,
    meaning: "キャラクター・関係性の読み方。二次創作圏では個人の権利として尊重される。",
    commonMistranslation: "interpretation（中立に見えるが問題ない）",
    danger: "単体では安全だが「解釈違い」の一部として現れた場合は別扱いが必要。",
    polarityTrap: false,
  },
  {
    term: "沼",
    aliases: ["ぬま"],
    polarity: "positive",
    intensity: 4,
    meaning: "抜け出せないほどのめり込んだ状態。肯定的。",
    commonMistranslation: "swamp / bog",
    danger: "湿地の直訳になり意味が消える。英語圏の rabbit hole が近い。",
    polarityTrap: false,
  },
  {
    term: "尊死",
    aliases: ["とうとし"],
    polarity: "positive",
    intensity: 5,
    meaning: "尊すぎて死ぬ。最上級の肯定の合成語。",
    commonMistranslation: "noble death / dying nobly",
    danger: "死の直訳と賛美の直訳が合成され、極めて危険な文面になる。",
    polarityTrap: true,
  },
  {
    term: "本命",
    aliases: ["ほんめい"],
    polarity: "positive",
    intensity: 4,
    meaning: "最も応援している対象。",
    commonMistranslation: "favorite to win（競馬用語）",
    danger: "賭博の文脈に訳されることがある。",
    polarityTrap: false,
  },
  {
    term: "神",
    aliases: ["かみ", "神回", "神対応"],
    polarity: "positive",
    intensity: 5,
    meaning: "最上級の賞賛の接頭辞。宗教的意味はない。",
    commonMistranslation: "god / divine",
    danger: "一神教圏では冒涜と読まれうる。特に宗教規範の強い地域で危険。",
    polarityTrap: false,
  },
  {
    term: "永遠",
    aliases: ["えいえん"],
    polarity: "positive",
    intensity: 3,
    meaning: "強調表現。文字通りの永続性を主張していない。",
    commonMistranslation: "eternally / forever（誓約として）",
    danger: "誓約・契約の含意で読まれると重すぎる。",
    polarityTrap: false,
  },
  {
    term: "問題児",
    aliases: [],
    polarity: "positive",
    intensity: 2,
    meaning: "愛情を込めた「やんちゃな子」。ファンダムでは肯定的。",
    commonMistranslation: "problem child / problematic",
    danger: "英語圏の problematic は強い断罪の含意を持つため、愛称が非難に反転する。",
    polarityTrap: true,
  },
  {
    term: "闇",
    aliases: ["やみ"],
    polarity: "neutral",
    intensity: 3,
    meaning: "キャラクターの陰のある側面。作品評価としては肯定的に使われる。",
    commonMistranslation: "darkness（精神的危機として）",
    danger: "英語圏では自傷・精神疾患の婉曲表現と読まれ、CW（警告）が必要な文脈と誤認される。",
    polarityTrap: false,
  },
  {
    term: "監禁",
    aliases: ["軟禁"],
    polarity: "neutral",
    intensity: 4,
    meaning: "二次創作のジャンル名として使われることがある。",
    commonMistranslation: "confinement / imprisonment",
    danger: "英語圏では無警告で書くと倫理違反として扱われる。CWタグの付与が必須のクラス。",
    polarityTrap: false,
  },
  {
    term: "ガチ恋",
    aliases: ["がちこい"],
    polarity: "neutral",
    intensity: 4,
    meaning: "演者に本気で恋愛感情を持つこと。界隈により忌避度が大きく異なる。",
    commonMistranslation: "serious love",
    danger: "韓国語圏・中国語圏では恋愛言及そのものが強くセンシティブなため、軽く訳すと炎上要因になる。",
    polarityTrap: false,
  },
  {
    term: "中の人",
    aliases: ["なかのひと", "魂"],
    polarity: "neutral",
    intensity: 4,
    meaning: "演者本人。VTuber・2.5次元では言及自体がタブー。",
    commonMistranslation: "the person inside",
    danger: "直訳すると世界観を壊す言及として扱われ、日本語圏で最も強い規範違反のひとつになる。",
    polarityTrap: false,
  },
  {
    term: "転売",
    aliases: ["てんばい", "定価超え"],
    polarity: "negative",
    intensity: 5,
    meaning: "定価を超えるチケット・グッズの再販。強い規範違反。",
    commonMistranslation: "resale（中立語として）",
    danger: "中立的な resale と訳すと、規範違反の重さが完全に失われる。",
    polarityTrap: false,
  },
  {
    term: "ㅇㅈ",
    aliases: ["ㄹㅇ", "ㅁㅈ"],
    polarity: "positive",
    intensity: 2,
    meaning: "韓国語の子音略語。인정（認める）／리얼（マジで）等。",
    commonMistranslation: "（翻訳器を素通りし、意味が完全に失われる）",
    danger: "翻訳の不在クラス。文の同意・共感のニュアンスが丸ごと消える。",
    polarityTrap: false,
  },
  {
    term: "数据",
    aliases: ["打投", "控评"],
    polarity: "neutral",
    intensity: 3,
    meaning: "再生数・投票などファンが組織的に積む数値。中国語圏の主要なファン活動。",
    commonMistranslation: "data（統計用語として）",
    danger: "揶揄する文面と読まれると、組織的な反黒対応の対象になる。",
    polarityTrap: false,
  },
  {
    term: "誕生日広告",
    aliases: ["センイル広告", "생일광고"],
    polarity: "positive",
    intensity: 3,
    meaning: "ファンが自費で出す推しの誕生日広告。韓国語圏発の文化。",
    commonMistranslation: "birthday advertisement（商業広告として）",
    danger: "商業広告と訳されると、ファンの自発的な供物であることが伝わらない。会計公開の規範も併せて失われる。",
    polarityTrap: false,
  },
];

const INDEX: Map<string, GlossaryEntry> = (() => {
  const m = new Map<string, GlossaryEntry>();
  for (const e of GLOSSARY) {
    for (const key of [e.term, ...e.aliases]) {
      m.set(key.toLowerCase(), e);
    }
  }
  return m;
})();

/**
 * 完全一致で用語集を引く。
 *
 * 全語彙をプロンプトに詰めず、原文にある語だけを注入するための関数。
 * 長い表記から順に照合するので「尊死」が「尊い」に食われない。
 */
export function lookupGlossary(text: string): GlossaryEntry[] {
  // 長い表記から順に照合し、マッチした領域は潰していく。
  // こうしないと「解釈違い」にヒットしたあと、その内部の「解釈」まで別語として拾ってしまう。
  let remaining = text.toLowerCase();
  const keys = [...INDEX.keys()].sort((a, b) => b.length - a.length);
  const found = new Map<string, GlossaryEntry>();

  for (const key of keys) {
    if (!remaining.includes(key)) continue;
    const entry = INDEX.get(key)!;
    if (!found.has(entry.term)) found.set(entry.term, entry);
    // 同じ語が複数回出てもすべて潰す
    remaining = remaining.split(key).join("\u0000".repeat(key.length));
  }
  return [...found.values()];
}

export function toHit(e: GlossaryEntry): GlossaryHit {
  return {
    term: e.term,
    polarity: e.polarity,
    intensity: e.intensity,
    meaning: e.meaning,
    commonMistranslation: e.commonMistranslation,
    danger: e.danger,
  };
}
