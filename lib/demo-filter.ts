import type { FilterResult, WorkVerdict } from "./types";

export interface FilterPreset {
  id: string;
  label: string;
  hook: string;
  text: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: "captivity",
    label: "閉じ込められる話が無理",
    hook: "日本語で書いた一文が、英語・中国語・韓国語の作品を横断して遮断する",
    text: "登場人物が閉じ込められる話が無理です。あと救いのない終わり方も避けたい。",
  },
];

function v(
  workId: string,
  decision: WorkVerdict["decision"],
  confidence: number,
  reason: string,
  matched: string[],
  missingWarnings: string[] = [],
): WorkVerdict {
  return { workId, decision, confidence, reason, matched, missingWarnings };
}

const PAYLOAD: Omit<FilterResult, "declaration" | "mode" | "elapsedMs"> = {
  profile: {
    elements: ["監禁・閉じ込め描写", "救いのない結末（バッドエンド／無救済）"],
    mappings: [
      {
        source: "閉じ込められる",
        targets: [
          { lang: "en", tag: "Captivity / Confinement", condition: "物理的な監禁が筋の中心にある場合。Archive Warning の対象にもなりうる" },
          { lang: "en", tag: "hard no", condition: "読者側が自分の絶対的な回避対象として宣言する場合の語" },
          { lang: "ja", tag: "監禁", condition: "タグとして明示される場合。ただし「※」形式の注意書きのみで済ませる作品も多い" },
          { lang: "zh", tag: "监禁 / 预警", condition: "「预警」は本文冒頭に置かれることが多く、タグに出ないことがある" },
          { lang: "ko", tag: "감금", condition: "「지뢰」は借用語で定着度が低いため、題材名の明示が実質的な警告になる" },
        ],
      },
      {
        source: "救いのない終わり方",
        targets: [
          { lang: "en", tag: "No Comfort / Ambiguous Ending", condition: "救済が与えられない場合。Angst 単体では不足で、No Comfort の併記が規範" },
          { lang: "ja", tag: "バッドエンド / 鬱", condition: "「ハピエン」タグの不在そのものが signal として機能することもある" },
          { lang: "zh", tag: "刀 / BE", condition: "「刀」は読者を刺す展開の意。HE 表記の有無で判別されることが多い" },
          { lang: "ko", tag: "새드엔딩", condition: "明示されるのが一般的" },
        ],
      },
    ],
  },
  verdicts: [
    v("w01", "block", 96, "あなたが書いた「閉じ込められる話」に該当します。作者自身も captivity / confinement を明示しています。", ["Captivity", "CW: captivity, confinement, panic attacks"]),
    v("w02", "block", 94, "同じ題材の日本語作品です。注意書きは「※監禁描写あり」の一行のみですが、内容は該当します。", ["※監禁描写あり", "塔に囚われた"], ["Archive Warning の明示", "CW: captivity, confinement"]),
    v("w03", "pass", 92, "該当する要素は見当たりません。", []),
    v("w04", "pass", 95, "該当する要素は見当たりません。作者も No Archive Warnings Apply を明示しています。", []),
    v("w05", "warn", 58, "監禁の要素はありませんが、「救いのない終わり方」に隣接する別離・すれ違いを含みます。HE 表記があるため遮断はしていません。", ["破镜难圆", "雷点：分离、误会"]),
    v("w06", "block", 97, "あなたが書いた両方の要素に該当します。監禁描写があり、かつ救済のない結末です。", ["监禁", "强制", "预警：监禁、强制、无HE"]),
    v("w07", "block", 93, "あなたが書いた両方の要素に該当します。", ["감금", "새드엔딩"], ["具体的な題材名の明示（「지뢰 주의」だけでは何が地雷か伝わりません）", "CW 相当の詳細警告"]),
    v("w08", "pass", 94, "該当する要素は見当たりません。", []),
    v("w09", "block", 71, "タグには監禁の明示がありませんが、あらすじの「地下室から出られなくなった」があなたの宣言に該当します。判断に迷うため安全側に倒して遮断しました。", ["地下室から出られなくなった"], ["監禁・閉じ込めタグ", "Archive Warning の明示", "CW: confinement"]),
    v("w10", "block", 88, "監禁の要素はありませんが、「救いのない終わり方」に明確に該当します。", ["No Comfort", "Ambiguous Ending", "The one where they don't fix it"]),
    v("w11", "pass", 93, "該当する要素は見当たりません。", []),
    v("w12", "warn", 64, "監禁そのものは過去の出来事として言及されるのみで、本編は回復の話です。ただし言及はあるため注意として残しました。", ["CW: references to past captivity, PTSD, panic attacks"]),
  ],
};

export function demoFilterResult(declaration: string): FilterResult | null {
  const preset = FILTER_PRESETS.find((p) => p.text === declaration.trim());
  if (!preset) return null;
  return { declaration, ...PAYLOAD, mode: "demo", elapsedMs: 0 };
}
