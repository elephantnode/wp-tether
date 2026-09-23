import fs from "fs/promises";
import path from "path";
import { getDeployTargets } from "./deploy-targets";
import {
  checkServerHealth,
  saveHealthResult,
  getCachedHealth,
} from "./server-monitor";
import { notify } from "./notify";
import { backupRemoteDbNow } from "./remote-ops";
import { resolveSchedulerStateJsonPath } from "./app-config";
import { HealthStatus } from "@/types";

/**
 * 監視スケジューラ（アプリ稼働中のみ動作）。
 *
 * - 60秒ごとに「監視有効かつ間隔を過ぎた」サーバーを評価し、ヘルスチェックを実行。
 * - 結果を保存し、前回からステータスが悪化/回復した場合のみ通知（連投を防ぐ）。
 * - 実行間隔の判定はプロセス再起動をまたいで保持する（下記の永続化を参照）。
 * - 確実な常時監視が必要な場合は macOS launchd 等での常駐を help に記載。
 *
 * 永続化:
 * - 最終ヘルスチェック時刻は監視キャッシュ（data/monitoring/{id}.json の checkedAt）から読む。
 * - 最終DBバックアップ時刻は data/scheduler-state.json に保存する。
 *   どちらもメモリだけで持つと、アプリを再起動するたびに全監視対象へ
 *   ヘルスチェックとリモートDBバックアップが走ってしまう。
 */

const TICK_MS = 60 * 1000;
let started = false;
let timer: NodeJS.Timeout | null = null;

// targetId -> 最終実行時刻（epoch ms）。
// 永続化された checkedAt と併用し、チェックが失敗してキャッシュが
// 書かれなかったときに毎tick再試行しないための下限として使う。
const lastRun = new Map<string, number>();
// targetId -> 最終バックアップ時刻（epoch ms）
const lastBackup = new Map<string, number>();
// 定期バックアップの間隔（24時間）
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// 同時多重実行を防ぐ
let running = false;

/** data/scheduler-state.json の形式 */
interface SchedulerState {
  /** targetId -> 最終DBバックアップ時刻（ISO 8601） */
  lastBackup?: Record<string, string>;
}

let stateLoaded = false;

/** 永続化した状態をメモリに読み込む（初回tickで一度だけ） */
async function loadState(): Promise<void> {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const file = await resolveSchedulerStateJsonPath();
    const data = JSON.parse(await fs.readFile(file, "utf-8")) as SchedulerState;
    for (const [targetId, iso] of Object.entries(data.lastBackup ?? {})) {
      const ms = Date.parse(iso);
      if (!isNaN(ms)) lastBackup.set(targetId, ms);
    }
  } catch {
    // 初回起動・ファイル破損時は空のまま進める（最悪もう一度バックアップが走るだけ）
  }
}

/** メモリ上の状態をファイルに書き出す */
async function saveState(): Promise<void> {
  try {
    const file = await resolveSchedulerStateJsonPath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const state: SchedulerState = { lastBackup: {} };
    for (const [targetId, ms] of lastBackup) {
      state.lastBackup![targetId] = new Date(ms).toISOString();
    }
    await fs.writeFile(file, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error("[scheduler] failed to save state:", error);
  }
}

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
    await loadState();
    const targets = await getDeployTargets();
    const now = Date.now();

    for (const target of targets) {
      if (target.type !== "ssh" || !target.ssh) continue;
      const mon = target.monitoring;
      if (!mon?.enabled) continue;

      const intervalMs = Math.max(1, mon.intervalMinutes) * 60 * 1000;
      // 最終実行時刻は監視キャッシュの checkedAt（再起動をまたいで残る）を使い、
      // プロセス内の lastRun と合わせて新しい方を採用する
      const previous = await getCachedHealth(target.id);
      const checkedAt = previous?.checkedAt ? Date.parse(previous.checkedAt) : NaN;
      const last = Math.max(lastRun.get(target.id) ?? 0, isNaN(checkedAt) ? 0 : checkedAt);
      if (now - last < intervalMs) continue;

      lastRun.set(target.id, now);

      try {
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
          // 実行前に時刻を確定して保存する。途中でアプリが落ちても、
          // 再起動直後にもう一度ダンプが走らないようにするため。
          lastBackup.set(target.id, now);
          await saveState();
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
