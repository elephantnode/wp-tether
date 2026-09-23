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

/**
 * `===NAME===` マーカー区切りの出力をセクションに分解する。
 * マーカーが値と同じ行に出ても（WP-CLI の --format=count は末尾に改行を付けない）
 * 以降のセクションを取り落とさないよう、行単位ではなくマーカーで分割する。
 */
function splitSections(stdout: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = stdout.split(/===([A-Z]+)===/);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    sections[name] = (sections[name] ?? "") + (parts[i + 1] ?? "");
  }
  return sections;
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
  const sections = splitSections(stdout);

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
  // 各サブコマンドは stderr を握り潰さず、そのセクションに取り込む
  // （握り潰すと権限エラー等が「Command failed: ssh ...」としか出ない）
  const command =
    // cd 失敗時に後続の wp がホームディレクトリで走らないよう、ここで打ち切る
    `cd ${shellEscape(target.wordpressPath)} 2>&1 || { printf '\\n===FATAL===\\n'; exit 0; }; ` +
    // --format=count は末尾に改行を付けないため、マーカー側で改行を確保する
    // （echo だと "0===PLUGINS===" と繋がり、以降のセクションを取り落とす）
    [
      `printf '\\n===VERSION===\\n'`,
      `${wp} core version 2>&1`,
      `printf '\\n===COREUPDATE===\\n'`,
      `${wp} core check-update --format=count 2>&1`,
      `printf '\\n===PLUGINS===\\n'`,
      `${wp} plugin list --update=available --format=count 2>&1`,
      `printf '\\n===THEMES===\\n'`,
      `${wp} theme list --update=available --format=count 2>&1`,
      `printf '\\n===CRON===\\n'`,
      `${wp} cron event list --format=json 2>&1`,
    ].join("; ") +
    // 最後のコマンドの終了コードで連鎖全体が失敗し、取得済みの結果まで
    // 捨てられるのを防ぐ
    `; exit 0`;

  try {
    const { stdout } = await executeRemoteCommand(target, command, 60000);
    return parseWp(stdout);
  } catch (error) {
    // 非ゼロ終了でも stdout が取れていれば、部分的な結果を活かす
    const stdout = (error as { stdout?: string })?.stdout;
    if (stdout && stdout.includes("===VERSION===")) {
      return parseWp(stdout);
    }
    return {
      status: "unknown",
      message: error instanceof Error ? error.message : "WPチェック失敗",
    };
  }
}

/** PHP の警告系ノイズ。コマンド自体は成功していることがある */
const PHP_NOTICE_RE = /^(PHP\s+)?(Warning|Notice|Deprecated)\s*:/i;
/** 実際にコマンドが失敗している出力 */
const FATAL_RE = /^(PHP\s+)?(Fatal error|Parse error|Error)\s*:/i;
const SHELL_ERROR_RE = /command not found|No such file or directory|Permission denied/i;

interface SectionOutput {
  /** 警告行を除いた本体。値のパースにはこちらを使う */
  value: string;
  /** 取り除いた警告行（表示用の補足） */
  notices: string[];
  /** 本体が失敗を示している場合の要点（正常なら null） */
  error: string | null;
}

function summarizeLine(line: string): string {
  return line.replace(/\s+/g, " ").slice(0, 200);
}

/**
 * 警告行を重複判定しやすい形に正規化する。
 * 同じ警告が "PHP Deprecated: ..."（ログ向け）と "Deprecated: ..."（表示向け）の
 * 2行で届くため、先頭の "PHP " を落として1件に畳む。
 */
function normalizeNotice(line: string): string {
  return summarizeLine(line.replace(/^PHP\s+/i, ""));
}

/**
 * セクションの出力を「値」「無害な警告」「エラー」に分解する。
 * 各サブコマンドは 2>&1 なので、wp-config.php の重複 define などによる
 * PHP Warning が値と混ざって届く。警告行だけを理由に結果を捨てない。
 */
function parseSection(raw: string | undefined): SectionOutput {
  const lines = (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const notices: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    if (PHP_NOTICE_RE.test(line)) notices.push(normalizeNotice(line));
    else rest.push(line);
  }

  const error =
    rest.find((l) => FATAL_RE.test(l)) ??
    rest.find((l) => SHELL_ERROR_RE.test(l)) ??
    // 警告しか返っていない = 値が取れていないので、その警告を理由にする
    (rest.length === 0 && notices.length > 0 ? notices[0] : null);

  return {
    value: rest.join("\n"),
    notices,
    error: error ? summarizeLine(error) : null,
  };
}

function parseWp(stdout: string): WpHealthCheckResult {
  const sections = splitSections(stdout);

  // cd 失敗（wordpressPath の誤り）
  if ("FATAL" in sections) {
    return {
      status: "unknown",
      message: "WordPressパスにアクセスできません（設定を確認してください）",
    };
  }

  const result: WpHealthCheckResult = { status: "ok" };
  // 各セクションで拾った PHP 警告。重複を除いて結果に添える
  const notices = new Set<string>();

  // バージョンが取れない = WP-CLI が WordPress をブートストラップできていない。
  // 権限エラー等の実際の理由をそのまま見せる。
  const version = parseSection(sections.VERSION);
  version.notices.forEach((n) => notices.add(n));
  const coreVersion = version.value.trim();
  if (version.error || !/^\d+\.\d+/.test(coreVersion)) {
    return withNotices(
      {
        status: "unknown",
        message: version.error ?? "WP-CLIの実行に失敗しました",
      },
      notices
    );
  }
  result.coreVersion = coreVersion;

  const coreUpdate = parseSection(sections.COREUPDATE);
  const plugins = parseSection(sections.PLUGINS);
  const themes = parseSection(sections.THEMES);
  const cron = parseSection(sections.CRON);
  for (const section of [coreUpdate, plugins, themes, cron]) {
    section.notices.forEach((n) => notices.add(n));
  }

  // バージョンは取れたが個別コマンドが失敗しているケース
  // （例: wp-config.php が読めずDB接続を伴うコマンドだけ落ちる）
  const detailError =
    coreUpdate.error ?? plugins.error ?? themes.error ?? cron.error;
  if (detailError) {
    return withNotices(
      {
        status: "warning",
        coreVersion,
        message: `更新情報を取得できません: ${detailError}`,
      },
      notices
    );
  }

  const coreUpdateCount = parseInt(coreUpdate.value.trim(), 10);
  result.coreUpdateAvailable = !isNaN(coreUpdateCount) && coreUpdateCount > 0;

  const pluginUpdates = parseInt(plugins.value.trim(), 10);
  if (!isNaN(pluginUpdates)) result.pluginUpdates = pluginUpdates;

  const themeUpdates = parseInt(themes.value.trim(), 10);
  if (!isNaN(themeUpdates)) result.themeUpdates = themeUpdates;

  // cron: 実行予定時刻が10分以上過去のイベント数
  const cronRaw = cron.value.trim();
  if (cronRaw) {
    try {
      const events = JSON.parse(cronRaw) as { time?: number; next_run_gmt?: string }[];
      const nowMs = Date.now();
      result.overdueCron = events.filter((e) => {
        const ms = cronEventTimeMs(e);
        return ms !== null && ms < nowMs - 600_000;
      }).length;
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

  return withNotices(result, notices);
}

/**
 * cron イベントの実行予定時刻（ms）。
 * `wp cron event list --format=json` は GMT の文字列 next_run_gmt を返す
 * （--fields=time 指定時のみ epoch 秒の time が入る）。
 */
function cronEventTimeMs(event: { time?: number; next_run_gmt?: string }): number | null {
  if (typeof event.time === "number") return event.time * 1000;
  if (event.next_run_gmt) {
    const ms = Date.parse(event.next_run_gmt.replace(" ", "T") + "Z");
    if (!isNaN(ms)) return ms;
  }
  return null;
}

/** 結果に載せる PHP 警告の上限（Deprecated を大量に出すサイトがある） */
const MAX_NOTICES = 5;

/** PHP 警告があれば結果に添える（ステータスは変えない） */
function withNotices(
  result: WpHealthCheckResult,
  notices: Set<string>
): WpHealthCheckResult {
  if (notices.size > 0) {
    result.notices = [...notices].slice(0, MAX_NOTICES);
    result.noticeCount = notices.size;
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
