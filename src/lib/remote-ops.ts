import {
  DeployTarget,
  RemoteLogType,
  RemoteLogResult,
  CronEvent,
  CronListResult,
  MaintenanceResult,
} from "@/types";
import { executeRemoteCommand, shellEscape } from "./remote-exec";

async function wp(
  target: DeployTarget,
  args: string,
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string }> {
  const wpBin = target.wpCli?.path || "wp";
  return executeRemoteCommand(target, `cd ${shellEscape(target.wordpressPath)} && ${wpBin} ${args}`, timeoutMs);
}

// ===========================================
// リモートログビューア
// ===========================================
export async function getRemoteLog(
  target: DeployTarget,
  type: RemoteLogType,
  tail = 200
): Promise<RemoteLogResult> {
  const wpPath = shellEscape(target.wordpressPath);
  const n = Math.min(Math.max(tail, 10), 2000);

  if (type === "debug") {
    const logPath = `${target.wordpressPath.replace(/\/$/, "")}/wp-content/debug.log`;
    try {
      const { stdout } = await executeRemoteCommand(
        target,
        `tail -n ${n} ${wpPath}/wp-content/debug.log 2>/dev/null || echo '__NOTFOUND__'`,
        30000
      );
      if (stdout.trim() === "__NOTFOUND__") {
        return { type, content: "", message: "debug.log が見つかりません（WP_DEBUG_LOG が無効の可能性）" };
      }
      return { type, path: logPath, content: stdout };
    } catch (error) {
      return { type, content: "", message: error instanceof Error ? error.message : "取得失敗" };
    }
  }

  // php-error: PHP の error_log 設定を WP-CLI で解決して tail
  try {
    const { stdout: pathOut } = await wp(target, `eval 'echo ini_get("error_log");' 2>/dev/null`, 30000);
    const logPath = pathOut.trim();
    if (!logPath) {
      return { type, content: "", message: "PHP error_log のパスを取得できませんでした" };
    }
    const { stdout } = await executeRemoteCommand(
      target,
      `tail -n ${n} ${shellEscape(logPath)} 2>/dev/null || echo '__NOTFOUND__'`,
      30000
    );
    if (stdout.trim() === "__NOTFOUND__") {
      return { type, path: logPath, content: "", message: `ログファイルにアクセスできません: ${logPath}` };
    }
    return { type, path: logPath, content: stdout };
  } catch (error) {
    return { type, content: "", message: error instanceof Error ? error.message : "取得失敗" };
  }
}

// ===========================================
// WP-Cron 管理
// ===========================================
export async function listCronEvents(target: DeployTarget): Promise<CronListResult> {
  if (target.wpCli?.available === false) {
    return { events: [], overdueCount: 0 };
  }

  try {
    const { stdout } = await wp(
      target,
      "cron event list --format=json --fields=hook,next_run_gmt,next_run_relative,schedule 2>/dev/null || echo '[]'",
      30000
    );
    const raw = JSON.parse(stdout || "[]") as {
      hook: string;
      next_run_gmt?: string;
      next_run_relative?: string;
      schedule?: string;
    }[];

    const now = Date.now();
    const events: CronEvent[] = raw.map((e) => {
      const gmt = e.next_run_gmt;
      const ts = gmt ? Date.parse(gmt + " GMT") : NaN;
      const overdue = !isNaN(ts) && ts < now - 600000; // 10分以上遅延
      return {
        hook: e.hook,
        nextRunGmt: gmt,
        nextRunRelative: e.next_run_relative,
        schedule: e.schedule,
        overdue,
      };
    });

    return { events, overdueCount: events.filter((e) => e.overdue).length };
  } catch {
    return { events: [], overdueCount: 0 };
  }
}

export async function runDueCron(target: DeployTarget): Promise<MaintenanceResult> {
  if (target.wpCli?.available === false) {
    return { success: false, output: "", error: "リモートに WP-CLI がありません" };
  }
  try {
    const { stdout, stderr } = await wp(target, "cron event run --due-now 2>&1", 120000);
    return { success: true, output: (stdout + stderr).trim() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: msg, error: msg };
  }
}

// ===========================================
// オンデマンド DB バックアップ（リモート wp db export）
// ===========================================
export async function backupRemoteDbNow(target: DeployTarget): Promise<MaintenanceResult> {
  if (target.wpCli?.available === false) {
    return { success: false, output: "", error: "リモートに WP-CLI がありません" };
  }
  try {
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const safeName = target.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const { stdout: home } = await executeRemoteCommand(target, "echo $HOME");
    const backupDir = `${home.trim()}/wp-tether-maintenance-backups/${safeName}`;
    const backupPath = `${backupDir}/db_${timestamp}.sql`;

    await executeRemoteCommand(target, `mkdir -p ${shellEscape(backupDir)}`);
    await wp(target, `db export ${shellEscape(backupPath)}`, 300000);

    // 古いバックアップを5件まで保持
    await executeRemoteCommand(
      target,
      `ls -1t ${shellEscape(backupDir)}/db_*.sql 2>/dev/null | tail -n +6 | xargs -r rm -f`
    ).catch(() => {});

    return { success: true, backupPath, output: `バックアップを作成しました: ${backupPath}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: msg, error: msg };
  }
}
