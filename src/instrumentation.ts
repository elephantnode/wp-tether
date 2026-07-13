/**
 * Next.js instrumentation: サーバー起動時に一度だけ呼ばれる。
 * 監視スケジューラを起動する（Node.js ランタイムのみ）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
