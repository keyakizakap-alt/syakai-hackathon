/**
 * UIスクリーンショットの撮影スクリプト。
 *
 *   npm run shots
 *
 * デモモード（APIキー不要）でプリセットを判定させ、docs/screenshots/ に保存する。
 * READMEに貼る画像と、発表資料に使う画像をここから再生成できるようにしてある。
 * UIを変更したら撮り直すこと。手作業で撮ると解像度と操作手順がぶれて、
 * 「どの時点のUIなのか分からない画像」が溜まるため、スクリプトに固定している。
 *
 * このリポジトリのCI等では動かさない。ローカル／開発環境で任意に実行する道具。
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";

/**
 * ブラウザの実体を解決する。
 *
 * playwright パッケージのバージョンと、環境に事前配置されたブラウザの
 * ビルド番号がずれていると `npx playwright install` を促されて落ちる。
 * 事前配置されたバイナリがあればそれを直接使い、ダウンロードを回避する。
 * 無ければ playwright の既定解決に任せる（各自 `npx playwright install`）。
 */
function resolveExecutablePath() {
  const candidates = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  ];
  return candidates.find((p) => existsSync(p));
}

const PORT = process.env.SHOT_PORT ?? "3900";
const BASE = `http://localhost:${PORT}`;
const OUT = "docs/screenshots";

/** 出国審査・入国審査それぞれのプリセット。デモモードで判定できるもの */
const CHECK_PRESET = "新衣装かわいすぎて死んだ💀 しんどい……もう無理……";
const FILTER_PRESET = "登場人物が閉じ込められる話が無理です。あと救いのない終わり方も避けたい。";

function startServer() {
  // APIキーを明示的に外し、必ずデモモードで撮る（実キーの結果が混ざると再現できない）
  const env = { ...process.env, PORT };
  delete env.OPENROUTER_API_KEY;

  const proc = spawn("npm", ["start"], { env, stdio: "ignore", detached: true });
  return proc;
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`サーバーが ${timeoutMs}ms 以内に起動しませんでした`);
}

/** 判定結果が出るまで待つ。結果カードが出る前に撮ると空の画面が残る */
async function runPreset(page, presetText, resultSelector) {
  await page.getByRole("textbox").fill(presetText);
  await page.getByRole("button", { name: /検める|入国審査をかける/ }).click();
  await page.waitForSelector(resultSelector, { timeout: 30_000 });
  // アニメーション（.rise）の完了を待つ
  await page.waitForTimeout(600);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const server = startServer();
  try {
    await waitForServer();
    const executablePath = resolveExecutablePath();
    const browser = await chromium.launch(executablePath ? { executablePath } : {});

    // ── デスクトップ ──────────────────────────────────
    const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
      locale: "ja-JP",
    });
    const page = await desktop.newPage();

    await page.goto(BASE);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/01-top.png` });
    console.log("撮影: 01-top.png（初期画面）");

    await runPreset(page, CHECK_PRESET, "text=検査結果");
    await page.screenshot({ path: `${OUT}/02-check-result.png` });
    console.log("撮影: 02-check-result.png（出国審査の結果・レーダー）");

    await page.screenshot({ path: `${OUT}/03-check-full.png`, fullPage: true });
    console.log("撮影: 03-check-full.png（文化圏別カードまで全体）");

    await page.getByRole("tab", { name: /入国審査/ }).click();
    await page.waitForTimeout(400);
    await runPreset(page, FILTER_PRESET, "text=遮断");
    await page.screenshot({ path: `${OUT}/04-filter-result.png` });
    console.log("撮影: 04-filter-result.png（入国審査・タグ写像）");

    await page.screenshot({ path: `${OUT}/05-filter-full.png`, fullPage: true });
    console.log("撮影: 05-filter-full.png（作品ごとの遮断判定まで全体）");

    await desktop.close();

    // ── モバイル ────────────────────────────────────
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ja-JP",
    });
    const mpage = await mobile.newPage();
    await mpage.goto(BASE);
    await mpage.waitForTimeout(400);
    await mpage.screenshot({ path: `${OUT}/06-mobile.png` });
    console.log("撮影: 06-mobile.png（モバイル）");
    await mobile.close();

    await browser.close();
    console.log(`\n完了。${OUT}/ に保存しました。`);
  } finally {
    // detached で起動しているのでプロセスグループごと落とす
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // 既に落ちている場合は無視
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
