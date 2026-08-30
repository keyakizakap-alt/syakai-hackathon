import type { NextConfig } from "next";

/**
 * セキュリティヘッダ。
 *
 * このアプリはユーザーが書いた文章をそのまま画面に表示する（判定対象の原文、
 * ハイライト、言い換え案）。Reactが自動エスケープするためXSSシンクは無いが、
 * 万一の取りこぼしに備えてCSPで多層防御を張る。
 *
 * script-src に 'unsafe-inline' が必要なのは、Next.js App Router が
 * ハイドレーション用のデータをインラインスクリプトとして埋め込むため。
 * nonce を使う厳格版は middleware が必要になるので、まずは
 * object-src/base-uri/frame-ancestors を締める形で実効的な防御を入れる。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // APIは同一オリジンのみ。外部への送信を塞ぐ（万一のデータ持ち出し対策）
  "connect-src 'self'",
  // <base> による相対URLの乗っ取りを防ぐ
  "base-uri 'self'",
  "form-action 'self'",
  // プラグイン等の埋め込みを一切許可しない
  "object-src 'none'",
  // クリックジャッキング対策（X-Frame-Options の後継）
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // レスポンスヘッダからNext.jsのバージョンを隠す（既知の脆弱性の的にされにくくする）
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // 古いブラウザ向けのクリックジャッキング対策（frame-ancestors の保険）
          { key: "X-Frame-Options", value: "DENY" },
          // Content-Type の推測による解釈違いを防ぐ
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 判定した文章がURL経由で外部に漏れないよう、リファラを絞る
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 使わない強力なブラウザ機能を明示的に切る
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // APIレスポンスはユーザー固有の判定結果。中間キャッシュに残さない
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
