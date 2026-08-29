import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ニュアンス税関 — 越境する言葉の出入国審査",
  description:
    "国境を越える一文が、各言語圏でどう誤読されるかを投稿前に判定する。ファンダム語彙の極性反転と、警告の越境失効を検出します。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
