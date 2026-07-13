import tls from "tls";
import fs from "fs/promises";
import path from "path";
import {
  DeployTarget,
  ServerHealthResult,
  HttpCheckResult,
  SslCheckResult,
  DiskCheckResult,
  ResourceCheckResult,
  WpHealthCheckResult,
  HealthStatus,
  MonitoringThresholds,
  DEFAULT_MONITORING_THRESHOLDS,
} from "@/types";
import { executeRemoteCommand, shellEscape } from "./remote-exec";
import { resolveDataDir } from "./app-config";

/** しきい値を取得（未設定はデフォルト） */
function getThresholds(target: DeployTarget): MonitoringThresholds {
  return target.monitoring?.thresholds ?? DEFAULT_MONITORING_THRESHOLDS;
}

/** 複数ステータスを総合（critical > warning > unknown > ok） */
function combineStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.every((s) => s === "ok")) return "ok";
  return "unknown";
}

// ===========================================
// HTTP 稼働チェック
// ===========================================
export async function checkHttp(target: DeployTarget): Promise<HttpCheckResult> {
  const thresholds = getThresholds(target);
  const url = target.vhost;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const headers: Record<string, string> = {};
    if (target.basicAuth?.user) {
      const token = Buffer.from(
        `${target.basicAuth.user}:${target.basicAuth.password ?? ""}`
      ).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);

    const responseMs = Date.now() - start;
    let status: HealthStatus = "ok";
    let message: string | undefined;

    if (res.status >= 500) {
      status = "critical";
      message = `サーバーエラー (${res.status})`;
    } else if (res.status >= 400) {
      status = "warning";
      message = `クライアントエラー (${res.status})`;
    } else if (responseMs > thresholds.httpResponseMs) {
      status = "warning";
      message = `応答が遅い (${responseMs}ms)`;
    }

    return {
      status,
      statusCode: res.status,
      responseMs,
      finalUrl: res.url,
      message,
    };
  } catch (error) {
    return {
      status: "critical",
      responseMs: Date.now() - start,
      message: error instanceof Error ? error.message : "接続失敗",
    };
  }
}

// ===========================================
// SSL 証明書チェック
// ===========================================
export async function checkSsl(target: DeployTarget): Promise<SslCheckResult> {
  const thresholds = getThresholds(target);
  let host: string;
  try {
    const parsed = new URL(target.vhost);
    if (parsed.protocol !== "https:") {
      return { status: "unknown", message: "HTTPS ではありません" };
    }
    host = parsed.hostname;
  } catch {
    return { status: "unknown", message: "vhost を解析できません" };
  }

  return new Promise<SslCheckResult>((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 10000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          resolve({ status: "unknown", message: "証明書を取得できません" });
          return;
        }

        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86400000);
        const issuer = cert.issuer?.O || cert.issuer?.CN;

        let status: HealthStatus = "ok";
        let message: string | undefined;
        if (daysRemaining < 0) {
          status = "critical";
          message = "証明書が期限切れ";
        } else if (daysRemaining < thresholds.sslExpiryDays) {
          status = "warning";
          message = `証明書の有効期限が近い (残り${daysRemaining}日)`;
        }

        resolve({
          status,
          validTo: validTo.toISOString(),
          daysRemaining,
          issuer,
          message,
        });
      }
    );

    socket.on("error", (err) => {
      resolve({ status: "critical", message: err.message });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ status: "critical", message: "SSL接続タイムアウト" });
    });
  });
}

// ===========================================
// ディスク + リソース（1回のSSHで取得）
// ===========================================
export async function checkDiskAndResource(
  target: DeployTarget
): Promise<{ disk: DiskCheckResult; resource: ResourceCheckResult }> {
  const thresholds = getThresholds(target);

  if (!target.ssh) {
    const na: HealthStatus = "unknown";
    return {
      disk: { status: na, message: "SSH設定なし" },
      resource: { status: na, message: "SSH設定なし" },
    };
  }

  const cmd = [
    `echo '===DISK==='`,
    `df -P ${shellEscape(target.wordpressPath)} 2>/dev/null | tail -1`,
    `echo '===MEM==='`,
    `free -m 2>/dev/null | awk '/^Mem:/{print $2, $3}'`,
    `echo '===LOAD==='`,
    `cat /proc/loadavg 2>/dev/null`,
    `echo '===CORES==='`,
    `nproc 2>/dev/null`,
  ].join("; ");

  try {
    const { stdout } = await executeRemoteCommand(target, cmd, 30000);
    return parseDiskAndResource(stdout, thresholds);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "取得失敗";
    return {
      disk: { status: "unknown", message: msg },
      resource: { status: "unknown", message: msg },
    };
  }
}

function parseDiskAndResource(
  stdout: string,
  thresholds: MonitoringThresholds
): { disk: DiskCheckResult; resource: ResourceCheckResult } {
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of stdout.split("\n")) {
    const m = line.match(/^===(\w+)===$/);
    if (m) {
      current = m[1];
      sections[current] = "";
    } else if (current) {
      sections[current] += line + "\n";
    }
  }

  // ディスク: "Filesystem 1024-blocks Used Available Capacity Mounted-on"
  const disk: DiskCheckResult = { status: "unknown" };
  const dfLine = (sections.DISK || "").trim();
  if (dfLine) {
    const cols = dfLine.split(/\s+/);
    // 末尾から: mount, capacity%, available, used, total
    const capIdx = cols.findIndex((c) => /^\d+%$/.test(c));
    if (capIdx >= 0) {
      const usagePercent = parseInt(cols[capIdx], 10);
      disk.usagePercent = usagePercent;
      disk.mount = cols[cols.length - 1];
      disk.status = usagePercent >= thresholds.diskUsagePercent ? "warning" : "ok";
      if (disk.status === "warning") {
        disk.message = `ディスク使用率 ${usagePercent}%`;
      }
    }
  }

  // メモリ + ロード
  const resource: ResourceCheckResult = { status: "ok" };
  const statuses: HealthStatus[] = [];

  const memLine = (sections.MEM || "").trim();
  if (memLine) {
    const [totalStr, usedStr] = memLine.split(/\s+/);
    const total = parseInt(totalStr, 10);
    const used = parseInt(usedStr, 10);
    if (total > 0) {
      const pct = Math.round((used / total) * 100);
      resource.memoryUsagePercent = pct;
      statuses.push(pct >= 90 ? "warning" : "ok");
    }
  }

  const loadLine = (sections.LOAD || "").trim();
  const cores = parseInt((sections.CORES || "").trim(), 10);
  if (loadLine) {
    const load1 = parseFloat(loadLine.split(/\s+/)[0]);
    resource.load1 = load1;
    if (!isNaN(cores) && cores > 0) {
      resource.cpuCores = cores;
      statuses.push(load1 > cores ? "warning" : "ok");
    }
  }

  if (statuses.length > 0) {
    resource.status = combineStatus(statuses);
    if (resource.status === "warning") {
      const parts: string[] = [];
      if (resource.memoryUsagePercent !== undefined && resource.memoryUsagePercent >= 90) {
        parts.push(`メモリ ${resource.memoryUsagePercent}%`);
      }
      if (resource.load1 !== undefined && resource.cpuCores && resource.load1 > resource.cpuCores) {
        parts.push(`ロード ${resource.load1}/${resource.cpuCores}コア`);
      }
      resource.message = parts.join(", ");
    }
  } else {
    resource.status = "unknown";
  }

  return { disk, resource };
}

// ===========================================
// WordPress ヘルス / 更新チェック
// ===========================================
export async function checkWp(target: DeployTarget): Promise<WpHealthCheckResult> {
  if (!target.ssh) {
    return { status: "unknown", message: "SSH設定なし" };
  }
  if (target.wpCli && target.wpCli.available === false) {
    return { status: "unknown", message: "リモートにWP-CLIなし" };
  }

  const wp = target.wpCli?.path || "wp";
  const command =
    `cd ${shellEscape(target.wordpressPath)} && ` +
    [
      `echo '===VERSION==='`,
      `${wp} core version 2>/dev/null`,
      `echo '===COREUPDATE==='`,
      `${wp} core check-update --format=count 2>/dev/null`,
      `echo '===PLUGINS==='`,
      `${wp} plugin list --update=available --format=count 2>/dev/null`,
      `echo '===THEMES==='`,
      `${wp} theme list --update=available --format=count 2>/dev/null`,
      `echo '===CRON==='`,
      `${wp} cron event list --format=json 2>/dev/null`,
    ].join("; ");

  try {
    const { stdout } = await executeRemoteCommand(target, command, 60000);
    return parseWp(stdout);
  } catch (error) {
    return {
      status: "unknown",
      message: error instanceof Error ? error.message : "WPチェック失敗",
    };
  }
}

function parseWp(stdout: string): WpHealthCheckResult {
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of stdout.split("\n")) {
    const m = line.match(/^===(\w+)===$/);
    if (m) {
      current = m[1];
      sections[current] = "";
    } else if (current) {
      sections[current] += line + "\n";
    }
  }

  const result: WpHealthCheckResult = { status: "ok" };
  const coreVersion = (sections.VERSION || "").trim();
  if (coreVersion) result.coreVersion = coreVersion;

  const coreUpdateCount = parseInt((sections.COREUPDATE || "").trim(), 10);
  result.coreUpdateAvailable = !isNaN(coreUpdateCount) && coreUpdateCount > 0;

  const pluginUpdates = parseInt((sections.PLUGINS || "").trim(), 10);
  if (!isNaN(pluginUpdates)) result.pluginUpdates = pluginUpdates;

  const themeUpdates = parseInt((sections.THEMES || "").trim(), 10);
  if (!isNaN(themeUpdates)) result.themeUpdates = themeUpdates;

  // cron: next_run_gmt が過去のイベント数
  const cronRaw = (sections.CRON || "").trim();
  if (cronRaw) {
    try {
      const events = JSON.parse(cronRaw) as { time?: number }[];
      const now = Math.floor(Date.now() / 1000);
      result.overdueCron = events.filter((e) => typeof e.time === "number" && e.time < now - 600).length;
    } catch {
      // パース失敗は無視
    }
  }

  // ステータス判定: 更新ありは info（warning にはしない）。コア更新は warning。
  const hasUpdates =
    result.coreUpdateAvailable ||
    (result.pluginUpdates ?? 0) > 0 ||
    (result.themeUpdates ?? 0) > 0;
  if (result.coreUpdateAvailable) {
    result.status = "warning";
    result.message = "コア更新あり";
  } else if (hasUpdates) {
    result.status = "warning";
    const parts: string[] = [];
    if (result.pluginUpdates) parts.push(`プラグイン${result.pluginUpdates}件`);
    if (result.themeUpdates) parts.push(`テーマ${result.themeUpdates}件`);
    result.message = "更新あり: " + parts.join(", ");
  }

  return result;
}

// ===========================================
// 総合ヘルスチェック
// ===========================================
export async function checkServerHealth(target: DeployTarget): Promise<ServerHealthResult> {
  const [http, ssl, diskRes, wp] = await Promise.all([
    checkHttp(target),
    checkSsl(target),
    checkDiskAndResource(target),
    checkWp(target),
  ]);

  const overall = combineStatus([
    http.status,
    ssl.status,
    diskRes.disk.status,
    diskRes.resource.status,
    wp.status,
  ]);

  return {
    targetId: target.id,
    checkedAt: new Date().toISOString(),
    overall,
    http,
    ssl,
    disk: diskRes.disk,
    resource: diskRes.resource,
    wp,
  };
}

// ===========================================
// 結果キャッシュ（data/monitoring/{targetId}.json）
// ===========================================
async function monitoringDir(): Promise<string> {
  const dir = path.join(await resolveDataDir(), "monitoring");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveHealthResult(result: ServerHealthResult): Promise<void> {
  const dir = await monitoringDir();
  await fs.writeFile(
    path.join(dir, `${result.targetId}.json`),
    JSON.stringify(result, null, 2)
  );
}

export async function getCachedHealth(targetId: string): Promise<ServerHealthResult | null> {
  try {
    const dir = await monitoringDir();
    const content = await fs.readFile(path.join(dir, `${targetId}.json`), "utf-8");
    return JSON.parse(content) as ServerHealthResult;
  } catch {
    return null;
  }
}
