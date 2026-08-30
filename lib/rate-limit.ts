/**
 * IPごとのスライディングウィンドウ・レート制限。
 *
 * このアプリのAPIは認証なしで公開され、1リクエストごとに有料のLLM APIを
 * 最大5回（panel統合1回＋gate1回、縮退時はpanelが4回に分割）呼び出す。
 * 制限が無いと、第三者が連打するだけでAPIキーの残高を焼き切れてしまう
 * （可用性の問題であると同時に金銭的な被害になる）。
 *
 * 外部依存（Redis等）を増やさずに動かすためプロセス内メモリで持つ。
 * Vercelのようなサーバーレス環境ではインスタンスごとに独立し、
 * インスタンスが再生成されるとリセットされるため、これは
 * 「無制限の連打を防ぐ一次防波堤」であって厳密な保証ではない。
 * 恒久的に運用するならRedis等の共有ストアに置き換える。
 */

interface Window {
  /** ウィンドウ内のリクエスト時刻（昇順） */
  hits: number[];
}

/** メモリ枯渇を防ぐための追跡キー数の上限。超えたら最も古いものから捨てる */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  /** 制限に達した場合、次に試せるまでの秒数 */
  retryAfterSec: number;
}

/**
 * クライアントの識別子を取り出す。
 *
 * x-forwarded-for は本来クライアントが偽装できるヘッダだが、Vercelのような
 * プラットフォームのプロキシ配下では末端で上書きされるため信頼できる。
 * 自前でリバースプロキシを立てる場合は、そのプロキシが同ヘッダを
 * 上書きしていることを確認すること。
 */
export function clientKeyOf(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * 指定キーが windowMs の間に limit 回まで、を満たすか判定し、
 * 満たす場合はこの呼び出しを1回分として記録する。
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const cutoff = now - windowMs;
  const win = windows.get(key) ?? { hits: [] };

  // ウィンドウから外れた古い記録を落とす
  const hits = win.hits.filter((t) => t > cutoff);

  if (hits.length >= limit) {
    // 最も古い記録がウィンドウから外れるまで待てば1枠空く
    const oldest = hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    windows.set(key, { hits });
    return { ok: false, retryAfterSec };
  }

  hits.push(now);
  windows.set(key, { hits });

  // Map の肥大化を防ぐ。Map は挿入順を保つので先頭が最も古い
  if (windows.size > MAX_TRACKED_KEYS) {
    const oldestKey = windows.keys().next().value;
    if (oldestKey !== undefined) windows.delete(oldestKey);
  }

  return { ok: true, retryAfterSec: 0 };
}

/** テスト用に内部状態をリセットする */
export function __resetRateLimit(): void {
  windows.clear();
}
