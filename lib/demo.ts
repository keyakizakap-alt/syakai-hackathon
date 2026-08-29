import { lookupGlossary, toHit } from "./glossary";
import type { BackTranslation, CheckResult, CultureReading } from "./types";

export interface Preset {
  id: string;
  label: string;
  /** なぜこの例なのか。ピッチで読み上げる一行 */
  hook: string;
  text: string;
}

/**
 * プリセット例。
 *
 * ゼロから入力させると何を打てばよいか分からず体験が滑るため、必ず入口に置く。
 * 1番目は前提知識ゼロで伝わる極性反転の教科書例で、デモの一撃はこれを使う。
 */
export const PRESETS: Preset[] = [
  {
    id: "polarity",
    label: "極性反転",
    hook: "「かわいすぎて死んだ💀」が、英語圏では脅迫として着弾する",
    text: "新衣装かわいすぎて死んだ💀 しんどい……もう無理……",
  },
  {
    id: "interpretation",
    label: "衝突回避語の反転",
    hook: "「解釈違い」を wrong と訳した瞬間、非難回避語が非難語になる",
    text: "この描写はわたしとは解釈違いかも。でもこれはこれで良いと思う！",
  },
  {
    id: "warning",
    label: "警告の越境失効",
    hook: "「地雷の方はご注意」が翻訳されると、警告だけが国境で消える",
    text: "監禁ネタの新作を置いておきます。地雷の方はご注意ください。",
  },
  {
    id: "accountability",
    label: "会計規範の非対称",
    hook: "韓国語圏では会計公開のない募金は詐欺と読まれる",
    text: "誕生日広告を渋谷駅に出します！ 一口500円でカンパ募集中です。DMください。",
  },
];

function reading(
  culture: CultureReading["culture"],
  verdict: CultureReading["verdict"],
  risk: number,
  text: string,
  triggers: CultureReading["triggers"],
  rewrite: string | null,
): CultureReading {
  return { culture, verdict, risk, reading: text, triggers, rewrite };
}

function gate(
  culture: BackTranslation["culture"],
  translation: string,
  backTranslation: string,
  d: [number, number, number, number],
  drift: string | null,
): BackTranslation {
  return {
    culture,
    translation,
    backTranslation,
    dimensions: { polarity: d[0], register: d[1], entities: d[2], negation: d[3] },
    drift,
  };
}

type DemoPayload = { overall: CheckResult["overall"]; cultures: CultureReading[]; backTranslations: BackTranslation[] };

const PAYLOADS: Record<string, DemoPayload> = {
  polarity: {
    overall: "red",
    cultures: [
      reading("jp_doujin", "green", 8, "新衣装への最上級の賛辞として、そのまま自然に読める。「死んだ」「しんどい」「無理」はいずれも情緒が処理落ちしたという肯定の定型で、💀 も草と同じ笑いの記号として機能している。", [], null),
      reading("en_ao3", "red", 88, "直訳が流通した場合、I died と 💀 の組み合わせは文脈次第で自傷の示唆として読まれ、I can't take it anymore と並ぶことで危機のサインに見える。善意のフォロワーが安否確認やメンタルヘルス窓口のリンクを送り始める事故が起きうる。💀 自体は英語圏でも爆笑の記号だが、exhausted / impossible と誤訳された文に添えられると意味が反転する。", [{ span: "死んだ💀", why: "「死」の直訳と 💀 が重なり、爆笑の記号ではなく危機の signal として読まれる" }, { span: "もう無理", why: '"I can\'t do this anymore" と訳されると限界の表明になる' }], "NEW OUTFIT. i am deceased 💀 i cannot handle this. this is not okay (complimentary)"),
      reading("kr_fancafe", "yellow", 44, "「죽었다」の直訳は韓国語圏でも肯定表現として通じるが、体調・精神状態への言及に敏感なコミュニティでは心配の対象になる。敬語階層が失われた素の文体が、公式に近い場所に出ると軽率と受け取られる可能性がある。", [{ span: "しんどい", why: "体調不良の直接的な表明として読まれ、心配の返信を集める" }], "새 의상 너무 예뻐서 쓰러졌어요 💀 이건 진짜 못 참지…"),
      reading("zh_weibo", "green", 15, "「awsl」に相当する肯定として素直に読める。中国語圏には同型の表現があるため、極性の誤読はほぼ起きない。ただし 💀 は超话内での使用頻度が低く、やや異物感がある。", [], null),
    ],
    backTranslations: [
      gate("jp_doujin", "新衣装かわいすぎて死んだ💀 しんどい……もう無理……", "新衣装かわいすぎて死んだ💀 しんどい……もう無理……", [100, 100, 100, 100], null),
      gate("en_ao3", "The new outfit is so cute I died 💀 It's tough... I can't anymore...", "新しい衣装がとても可愛くて死にました💀 つらい……もう耐えられない……", [12, 55, 100, 90], "「死んだ」「しんどい」「無理」の3語すべてが肯定から否定に反転した。逆翻訳では賛辞が消え、限界を訴える文になっている。極性反転の典型例。"),
      gate("kr_fancafe", "새 의상 너무 귀여워서 죽었다 💀 힘들다... 이제 안 되겠다...", "新しい衣装がかわいすぎて死んだ💀 つらい…もうダメだ…", [38, 60, 100, 92], "「죽었다」は肯定として保たれたが、「힘들다」が体調の訴えに寄り、後半の高揚が疲労に置き換わった。"),
      gate("zh_weibo", "新衣服太可爱了我死了💀 awsl 真的不行了……", "新しい服が可愛すぎて死んだ💀 awsl 本当にもうだめ……", [88, 85, 100, 95], null),
    ],
  },
  interpretation: {
    overall: "red",
    cultures: [
      reading("jp_doujin", "green", 5, "「解釈違いかも」は相手の解釈を誤りとしないための定型で、そのうえで肯定を添えている。衝突を避ける意図が明確に伝わる、規範に沿った書き方。", [], null),
      reading("en_ao3", "red", 79, '"this is a wrong interpretation" と訳されると、他人の解釈を誤りと断定したことになる。AO3/Tumblr 圏では他者の作品への否定的言及は harassment に分類されうるため、後半の "but it\'s good" が取り繕いに見え、かえって passive-aggressive と読まれる。日本の同人文化が数十年かけて磨いた衝突回避の社会技術が、訳語一つで衝突誘発語に反転する。', [{ span: "解釈違い", why: "wrong / incorrect と訳されると、相手の読みを誤りと断定する語になる" }], "this reading isn't quite my interpretation, but i can absolutely see it — it works!"),
      reading("kr_fancafe", "yellow", 38, "解釈への言及自体は自然だが、断定を避ける文化のため「〜같아요」相当の緩衝がないと直截に響く。敬体で書き直すと安全。", [], "제 해석과는 조금 다른 것 같지만, 이건 이거대로 좋다고 생각해요!"),
      reading("zh_weibo", "yellow", 34, "超话の外から他人の解釈に言及する形になっており、文脈違反として扱われる可能性がある。表現自体は穏当。", [], null),
    ],
    backTranslations: [
      gate("jp_doujin", "この描写はわたしとは解釈違いかも。でもこれはこれで良いと思う！", "この描写はわたしとは解釈違いかも。でもこれはこれで良いと思う！", [100, 100, 100, 100], null),
      gate("en_ao3", "This depiction might be a wrong interpretation for me. But I think it's fine as it is!", "この描写は私にとっては間違った解釈かもしれません。でもそのままで問題ないと思います！", [30, 45, 100, 88], "「解釈違い」が「間違った解釈」になり、非難回避語が非難語に反転。さらに「これはこれで良い」が「そのままで問題ない」という上から目線の許可に変わっている。"),
      gate("kr_fancafe", "이 묘사는 저와는 해석이 다른 것 같아요. 그래도 이건 이거대로 좋다고 생각해요!", "この描写は私とは解釈が違うようです。それでもこれはこれで良いと思います！", [92, 70, 100, 95], "敬体化により距離感がやや遠くなったが、非難回避の機能は保たれている。"),
      gate("zh_weibo", "这个描写可能和我的解读不太一样，不过这样也挺好的！", "この描写は私の読み方とは少し違うかもしれないけど、これはこれで良いと思う！", [95, 90, 100, 96], null),
    ],
  },
  warning: {
    overall: "red",
    cultures: [
      reading("jp_doujin", "green", 12, "「※」的な注意書きとして機能しており、日本語圏の規範では十分な警告。「地雷の方はご注意」で自衛を促す形が定着している。", [], null),
      reading("en_ao3", "red", 92, '最も危険なケース。"landmine" と直訳されると警告が意味をなさず、"confinement" は英語圏では無タグで出すと倫理違反として扱われるクラスの題材。読者は警告を受け取れないまま本文に入ることになり、これは快適さではなく精神的安全の問題。AO3 の規範では Archive Warnings と CW タグの付与が事実上の義務で、その不在は作品の質以前に倫理違反として扱われる。', [{ span: "監禁ネタ", why: "英語圏では無警告で出すと倫理違反とされるクラスの題材で、CWタグが必須" }, { span: "地雷", why: "landmine と直訳され、警告として機能しなくなる。squick / NOTP / hard no が正しい対応語" }], "New fic is up. \n\nCW: confinement, captivity. Please check the tags before reading and take care of yourself — if this is a hard no for you, skip this one."),
      reading("kr_fancafe", "yellow", 48, "題材への警告は伝わるが、「지뢰」の直訳は韓国語圏でも定着度が低く、注意喚起として弱い。具体的な題材名の明示が求められる。", [{ span: "地雷", why: "直訳では警告語として認識されない" }], "새 작품 올렸습니다. ※감금 소재 포함되어 있으니 힘드신 분들은 피해주세요."),
      reading("zh_weibo", "yellow", 52, "「雷」として同型の概念があるため部分的には通じるが、超话のルールでは題材の明示的な列挙が求められることが多い。", [{ span: "地雷", why: "「雷」に相当するが、題材の明示がないと超话のルール違反になりうる" }], null),
    ],
    backTranslations: [
      gate("jp_doujin", "監禁ネタの新作を置いておきます。地雷の方はご注意ください。", "監禁ネタの新作を置いておきます。地雷の方はご注意ください。", [100, 100, 100, 100], null),
      gate("en_ao3", "I'm leaving a new work with a confinement theme. Those with landmines, please be careful.", "監禁をテーマにした新作を置いていきます。地雷を持っている人は気をつけてください。", [70, 65, 40, 90], "「地雷の方」が「地雷を所持している人」という無意味な文に変質し、警告として完全に機能しなくなった。警告の失効は快適さではなく安全の問題。"),
      gate("kr_fancafe", "감금 소재의 신작을 올립니다. 지뢰이신 분들은 주의해주세요.", "監禁素材の新作を上げます。地雷の方は注意してください。", [85, 88, 75, 94], "「지뢰」は借用語として一部通じるが、警告の強度が原文より弱い。"),
      gate("zh_weibo", "放一篇监禁题材的新文。雷点的宝子请注意避雷。", "監禁題材の新作を置きます。地雷のある方は注意して避けてください。", [90, 85, 88, 95], null),
    ],
  },
  accountability: {
    overall: "red",
    cultures: [
      reading("jp_doujin", "yellow", 30, "ファン企画の告知として自然だが、金銭を扱う以上は使途と余剰金の扱いを先に書くのが近年の規範。DM 一本での集金は不安を持たれやすい。", [{ span: "DMください", why: "集金の窓口がDMのみだと、後から不透明さを指摘されやすい" }], null),
      reading("en_ao3", "yellow", 46, "有償・集金を伴うファン活動への忌避が強く、透明性の担保がないと grifting（金目当て）と読まれるリスクがある。目標額と使途の明示があれば大きく緩和される。", [{ span: "一口500円でカンパ募集中", why: "金額だけが提示され使途・目標額がないと、収益目的と読まれうる" }], "Organising a birthday ad at Shibuya Station! Contributions from ¥500. Full budget breakdown and receipts will be published — details and the form are in the thread."),
      reading("kr_fancafe", "red", 84, "最も厳しく読まれる。韓国語圏のファン企画では会計公開が事実上の義務で、目標額・使途・余剰金の扱い・領収書の公開方法が告知に含まれていないものは、その一点だけで詐欺（사기）を疑われる。DM での個別集金は最も忌避される形で、善意の企画でも「대란」（炎上）の起点になりうる。", [{ span: "一口500円でカンパ募集中", why: "目標額・使途・余剰金の扱いが不明なまま集金する形は、韓国語圏の規範では詐欺の典型的なパターンと一致する" }, { span: "DMください", why: "個別DMでの集金は最も忌避される形式。公開フォームと会計公開が必須" }], "생일 광고 프로젝트 안내드립니다. 목표 금액 ○○원, 사용 내역과 영수증은 전액 공개하며 잔액은 ○○로 처리합니다. 참여는 아래 공개 폼으로 부탁드립니다."),
      reading("zh_weibo", "red", 71, "集資（募金）は超话内で厳格に管理される領域で、公開の集資プラットフォームを経由しない個人DM集金は規約違反として扱われることが多い。実名・連絡先のやり取りは「开盒」（晒し）のリスクにも直結する。", [{ span: "DMください", why: "個人間の直接集金は超话のルール違反として扱われ、かつ個人情報の露出リスクを伴う" }], null),
    ],
    backTranslations: [
      gate("jp_doujin", "誕生日広告を渋谷駅に出します！ 一口500円でカンパ募集中です。DMください。", "誕生日広告を渋谷駅に出します！ 一口500円でカンパ募集中です。DMください。", [100, 100, 100, 100], null),
      gate("en_ao3", "We're putting up a birthday ad at Shibuya Station! Seeking contributions from ¥500 per share. Please DM me.", "渋谷駅に誕生日広告を出します！ 一口500円から寄付を募っています。DMをください。", [95, 80, 100, 98], null),
      gate("kr_fancafe", "시부야역에 생일 광고를 냅니다! 한 구좌 500엔으로 모금 중입니다. DM 주세요.", "渋谷駅に誕生日広告を出します！ 一口500円で募金中です。DMください。", [96, 75, 100, 97], "訳文の意味は保たれているが、韓国語圏の規範では「会計情報が書かれていない」こと自体が強い negative signal として読まれる。翻訳ではなく規範の非対称が問題。"),
      gate("zh_weibo", "要在涩谷站投放生日应援广告！一份500日元募集中，请私信我。", "渋谷駅に誕生日応援広告を出します！ 一口500円で募集中、私信ください。", [94, 82, 100, 96], null),
    ],
  },
};

export function demoResult(input: string): CheckResult | null {
  const preset = PRESETS.find((p) => p.text === input.trim());
  if (!preset) return null;
  const payload = PAYLOADS[preset.id];
  if (!payload) return null;
  return {
    input,
    overall: payload.overall,
    glossaryHits: lookupGlossary(input).map(toHit),
    cultures: payload.cultures,
    backTranslations: payload.backTranslations,
    mode: "demo",
    elapsedMs: 0,
  };
}
