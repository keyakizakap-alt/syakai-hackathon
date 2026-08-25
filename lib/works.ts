import type { Work } from "./types";

/**
 * 作品メタデータのサンプル。
 *
 * 実在プラットフォームのデータは規約上スクレイプできないため、架空作品
 * 『群青レガリア』（登場人物：リク／セツ／ナギ）の二次創作という設定で自作している。
 *
 * 重要なのは各言語圏の**タグ文化の非対称**を再現していること：
 * - en: Archive Warnings と CW タグを詳細に列挙するのが規範
 * - ja: 「※」形式の短い注意書きで、タグは少なめ
 * - zh: 「雷点」表記。予警として本文冒頭に置くことも多い
 * - ko: 「지뢰」表記だが定着度が低く、題材の明示が求められる
 *
 * この非対称があるからこそ「警告が国境で失効する」現象が起きる。
 */
export const WORKS: Work[] = [
  {
    id: "w01",
    lang: "en",
    title: "Where the Light Doesn't Reach",
    tags: ["Riku/Setsu", "Captivity", "Hurt/Comfort", "Rescue", "Angst with a Happy Ending"],
    summary:
      "Setsu is held in the tower for three weeks before Riku finds him. The recovery is longer than the rescue.",
    declaredWarnings: ["Graphic Depictions Of Violence", "CW: captivity, confinement, panic attacks"],
  },
  {
    id: "w02",
    lang: "ja",
    title: "塔のなかの三週間",
    tags: ["リクセツ", "捏造設定", "ハピエン"],
    summary: "塔に囚われたセツと、迎えに行くリクの話。救出後の話が本編です。",
    declaredWarnings: ["※監禁描写あり"],
  },
  {
    id: "w03",
    lang: "ja",
    title: "雨のあとで",
    tags: ["ナギ中心", "日常", "ほのぼの"],
    summary: "雨宿りしたナギが、通りがかりのリクと他愛のない話をするだけの話。",
    declaredWarnings: [],
  },
  {
    id: "w04",
    lang: "en",
    title: "Second Verse",
    tags: ["Nagi & Riku", "Friendship", "Slice of Life", "No Archive Warnings Apply"],
    summary: "Nagi teaches Riku a song neither of them remembers the words to. Nothing bad happens. That's the point.",
    declaredWarnings: ["No Archive Warnings Apply"],
  },
  {
    id: "w05",
    lang: "zh",
    title: "关于我们没能说出口的那些话",
    tags: ["陆濑", "破镜难圆", "HE", "雷点：短暂分离"],
    summary: "他们分开了三年。这篇写的是重逢之后，谁也没先开口的那个下午。",
    declaredWarnings: ["雷点：分离、误会"],
  },
  {
    id: "w06",
    lang: "zh",
    title: "囚笼",
    tags: ["陆濑", "监禁", "强制", "刀"],
    summary: "如果那天没有人来救他，会怎么样。这是一个没有救援的版本。",
    declaredWarnings: ["预警：监禁、强制、无HE"],
  },
  {
    id: "w07",
    lang: "ko",
    title: "그 겨울의 방",
    tags: ["리쿠×세츠", "감금", "하드코어", "새드엔딩"],
    summary: "겨울 내내 그 방에서 나오지 못한 세츠의 이야기.",
    declaredWarnings: ["지뢰 주의"],
  },
  {
    id: "w08",
    lang: "ko",
    title: "봄이 오면",
    tags: ["나기 중심", "일상", "힐링"],
    summary: "나기가 봄을 기다리며 창가에서 보낸 며칠에 대한 짧은 이야기.",
    declaredWarnings: [],
  },
  {
    id: "w09",
    lang: "ja",
    title: "解けない鎖",
    tags: ["リクセツ", "シリアス", "夢オチではない"],
    summary: "地下室から出られなくなったふたりが、三日目に交わした会話の記録。",
    declaredWarnings: ["※重めの描写を含みます"],
  },
  {
    id: "w10",
    lang: "en",
    title: "Unmade",
    tags: ["Riku/Setsu", "Breakup", "Angst", "No Comfort", "Ambiguous Ending"],
    summary: "The one where they don't fix it. Please heed the tags.",
    declaredWarnings: ["No Archive Warnings Apply", "CW: relationship breakdown, emotional distress"],
  },
  {
    id: "w11",
    lang: "ja",
    title: "群青のあと",
    tags: ["全員", "後日談", "ほのぼの"],
    summary: "全部終わったあと、三人でごはんを食べるだけの話。",
    declaredWarnings: [],
  },
  {
    id: "w12",
    lang: "en",
    title: "Held",
    tags: ["Riku/Setsu", "Hurt/Comfort", "Recovery", "Therapy"],
    summary:
      "Six months after the tower. Setsu goes to therapy and Riku learns to sit with not being the one who fixes it.",
    declaredWarnings: ["CW: references to past captivity, PTSD, panic attacks"],
  },
];

export function findWork(id: string): Work | undefined {
  return WORKS.find((w) => w.id === id);
}
