import { getDeployTargets } from "./deploy-targets";
import {
  checkServerHealth,
  saveHealthResult,
  getCachedHealth,
} from "./server-monitor";
import { notify } from "./notify";
import { backupRemoteDbNow } from "./remote-ops";
import { HealthStatus } from "@/types";

/**
 * 監視スケジューラ（アプリ稼働中のみ動作）。
 *
 * - 60秒ごとに「監視有効かつ間隔を過ぎた」サーバーを評価し、ヘルスチェックを実行。
 * - 結果を保存し、前回からステータスが悪化/回復した場合のみ通知（連投を防ぐ）。
 * - 確実な常時監視が必要な場合は macOS launchd 等での常駐を help に記載。
 */

const TICK_MS = 60 * 1000;
let started = false;
let timer: NodeJS.Timeout | null = null;

// targetId -> 最終実行時刻（epoch ms）
const lastRun = new Map<string, number>();
// targetId -> 最終バックアップ時刻（epoch ms）
const lastBackup = new Map<string, number>();
// 定期バックアップの間隔（24時間）
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// 同時多重実行を防ぐ
let running = false;

function severity(status: HealthStatus): number {
  switch (status) {
    case "ok":
      return 0;
    case "unknown":
      return 1;
    case "warning":
      return 2;
    case "critical":
      return 3;
    default:
      return 1;
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const targets = await getDeployTargets();
    const now = Date.now();

    for (const target of targets) {
      if (target.type !== "ssh" || !target.ssh) continue;
      const mon = target.monitoring;
      if (!mon?.enabled) continue;

      const intervalMs = Math.max(1, mon.intervalMinutes) * 60 * 1000;
      const last = lastRun.get(target.id) ?? 0;
      if (now - last < intervalMs) continue;

      lastRun.set(target.id, now);

      try {
        const previous = await getCachedHealth(target.id);
        const result = await checkServerHealth(target);
        await saveHealthResult(result);

        const prevStatus = previous?.overall ?? "unknown";
        const newStatus = result.overall;

        // 悪化（warning/critical へ）時に通知
        if (severity(newStatus) > severity(prevStatus) && severity(newStatus) >= 2) {
          const issues = [
            result.http.message,
            result.ssl.message,
            result.disk.message,
            result.resource.message,
            result.wp.message,
          ]
            .filter(Boolean)
            .join(" / ");
          await notify({
            title: `[${target.name}] ${newStatus === "critical" ? "重大" : "警告"}`,
            message: issues || "ヘルスチェックで問題を検出しました",
            level: newStatus === "critical" ? "critical" : "warning",
            targetId: target.id,
          });
        } else if (severity(prevStatus) >= 2 && newStatus === "ok") {
          // 回復通知
          await notify({
            title: `[${target.name}] 復旧`,
            message: "ヘルスチェックが正常に戻りました",
            level: "info",
            targetId: target.id,
          });
        }
      } catch (error) {
        console.error(`[scheduler] check failed for ${target.id}:`, error);
      }

      // 定期 DB バックアップ（監視有効サーバーを1日1回）
      try {
        const lastBk = lastBackup.get(target.id) ?? 0;
        if (now - lastBk >= BACKUP_INTERVAL_MS) {
          lastBackup.set(target.id, now);
          const result = await backupRemoteDbNow(target);
          if (!result.success) {
            await notify({
              title: `[${target.name}] バックアップ失敗`,
              message: result.error || "定期DBバックアップに失敗しました",
              level: "warning",
              targetId: target.id,
            });
          }
        }
      } catch (error) {
        console.error(`[scheduler] backup failed for ${target.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[scheduler] tick error:", error);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  // 起動直後に1回、その後は定期実行
  setTimeout(() => void tick(), 5000);
  timer = setInterval(() => void tick(), TICK_MS);
  console.log("[scheduler] monitoring scheduler started");
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
