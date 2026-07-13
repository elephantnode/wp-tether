import fs from "fs/promises";
import path from "path";
import {
  DeployTarget,
  SecurityVersionInfo,
  SecurityVulnerabilityCheck,
  SecurityFileScanResult,
  SecurityFileScanIssue,
  SecurityRecommendation,
  ChecksumVerifyResult,
  FilePermissionAuditResult,
  RemoteSecurityScanResult,
  SecurityHeadersResult,
  SecurityExposureResult,
  SecurityWpConfigResult,
} from "@/types";
import { executeRemoteCommand, shellEscape } from "./remote-exec";
import { resolveDataDir } from "./app-config";
import {
  fetchVulnerabilityChecks,
  buildRecommendations,
  checkSecurityHeaders,
  checkWordPressExposure,
  analyzeWpConfig,
} from "./security-scan";

/** リモート WP-CLI を実行（cd <wpPath> && wp ...） */
async function wp(target: DeployTarget, args: string, timeoutMs = 60000): Promise<{ stdout: string; stderr: string }> {
  const wpBin = target.wpCli?.path || "wp";
  return executeRemoteCommand(target, `cd ${shellEscape(target.wordpressPath)} && ${wpBin} ${args}`, timeoutMs);
}

// ===========================================
// バージョン情報（リモート WP-CLI）
// ===========================================
async function getRemoteVersionInfo(target: DeployTarget): Promise<SecurityVersionInfo> {
  const result: SecurityVersionInfo = { plugins: [], themes: [] };

  const [core, plugins, themes, php] = await Promise.all([
    wp(target, "core version").catch(() => ({ stdout: "", stderr: "" })),
    wp(target, "plugin list --format=json --fields=name,version,status").catch(() => ({ stdout: "[]", stderr: "" })),
    wp(target, "theme list --format=json --fields=name,version,status").catch(() => ({ stdout: "[]", stderr: "" })),
    wp(target, "eval 'echo PHP_VERSION;'").catch(() => ({ stdout: "", stderr: "" })),
  ]);

  const coreVersion = core.stdout.trim();
  if (coreVersion) result.wordpress = coreVersion;
  const phpVersion = php.stdout.trim();
  if (phpVersion) result.php = phpVersion;

  try {
    const list = JSON.parse(plugins.stdout || "[]") as { name: string; version: string; status: string }[];
    result.plugins = list.map((p) => ({
      name: p.name,
      version: p.version || "",
      status: p.status === "active" ? "active" : "inactive",
    }));
  } catch {
    /* ignore */
  }
  try {
    const list = JSON.parse(themes.stdout || "[]") as { name: string; version: string; status: string }[];
    result.themes = list.map((t) => ({
      name: t.name,
      version: t.version || "",
      status: t.status === "active" ? "active" : "inactive",
    }));
  } catch {
    /* ignore */
  }

  return result;
}

// ===========================================
// コア/プラグイン整合性検証（verify-checksums）
// ===========================================
async function verifyCoreChecksum(target: DeployTarget): Promise<ChecksumVerifyResult> {
  try {
    // 成功時はメッセージのみ、不一致時は各ファイルが stderr/stdout に出る（exit code 非0）
    const { stdout, stderr } = await wp(target, "core verify-checksums 2>&1 || true", 120000);
    const output = (stdout + "\n" + stderr).trim();
    const mismatches = output
      .split("\n")
      .filter((l) => /Warning|does not (match|verify)|checksum/i.test(l) && !/Success/i.test(l))
      .map((l) => l.trim())
      .slice(0, 50);
    const hasMismatch = mismatches.length > 0;
    return { checked: true, hasMismatch, mismatches };
  } catch (error) {
    return {
      checked: false,
      skippedReason: error instanceof Error ? error.message : "検証失敗",
      hasMismatch: false,
      mismatches: [],
    };
  }
}

async function verifyPluginChecksum(target: DeployTarget): Promise<ChecksumVerifyResult> {
  try {
    // --all で wordpress.org 配布プラグインを検証。非配布プラグインは「No checksums」で警告するため除外。
    const { stdout, stderr } = await wp(target, "plugin verify-checksums --all --format=csv 2>&1 || true", 180000);
    const output = (stdout + "\n" + stderr).trim();
    const mismatches = output
      .split("\n")
      .filter((l) => /,/.test(l))
      .filter((l) => !/^plugin_name,/i.test(l)) // ヘッダ除外
      .filter((l) => !/No checksums available/i.test(l))
      .map((l) => l.trim())
      .slice(0, 100);
    return { checked: true, hasMismatch: mismatches.length > 0, mismatches };
  } catch (error) {
    return {
      checked: false,
      skippedReason: error instanceof Error ? error.message : "検証失敗",
      hasMismatch: false,
      mismatches: [],
    };
  }
}

// ===========================================
// ファイル権限監査
// ===========================================
async function auditFilePermissions(target: DeployTarget): Promise<FilePermissionAuditResult> {
  const wpPath = shellEscape(target.wordpressPath);
  const cmd = [
    `echo '===WPCONFIG==='`,
    // wp-config.php は親ディレクトリにある場合もある
    `(stat -c '%a' ${wpPath}/wp-config.php 2>/dev/null || stat -c '%a' ${wpPath}/../wp-config.php 2>/dev/null || stat -f '%Lp' ${wpPath}/wp-config.php 2>/dev/null)`,
    `echo '===WORLDWRITABLE==='`,
    `find ${wpPath}/wp-content -type f -perm -0002 2>/dev/null | head -20`,
    `echo '===WWCOUNT==='`,
    `find ${wpPath}/wp-content -type f -perm -0002 2>/dev/null | wc -l`,
  ].join("; ");

  try {
    const { stdout } = await executeRemoteCommand(target, cmd, 60000);
    const sections = splitSections(stdout);

    const wpConfigPerms = (sections.WPCONFIG || "").trim() || undefined;
    let wpConfigTooOpen: boolean | undefined;
    if (wpConfigPerms && /^\d{3,4}$/.test(wpConfigPerms)) {
      const last = wpConfigPerms.slice(-3);
      const group = parseInt(last[1], 10);
      const other = parseInt(last[2], 10);
      // other に読み取り/書き込み、または group に書き込みがあれば緩すぎ
      wpConfigTooOpen = other > 0 || (group & 2) > 0;
    }

    const samples = (sections.WORLDWRITABLE || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const count = parseInt((sections.WWCOUNT || "").trim(), 10);

    return {
      checked: true,
      wpConfigPerms,
      wpConfigTooOpen,
      worldWritableCount: isNaN(count) ? samples.length : count,
      worldWritableSamples: samples,
    };
  } catch (error) {
    return {
      checked: false,
      skippedReason: error instanceof Error ? error.message : "監査失敗",
      worldWritableSamples: [],
    };
  }
}

// ===========================================
// マルウェアパターン検査（リモート grep）
// ===========================================
/** grep -E 用の高シグナルな PHP パターン */
const REMOTE_GREP_PATTERNS = [
  "eval\\s*\\(",
  "base64_decode\\s*\\(",
  "gzinflate\\s*\\(",
  "str_rot13\\s*\\(",
  "shell_exec\\s*\\(",
  "passthru\\s*\\(",
  "create_function\\s*\\(",
  "preg_replace\\s*\\([^,]*/e",
];

async function remoteFileScan(target: DeployTarget): Promise<SecurityFileScanResult> {
  const wpPath = shellEscape(target.wordpressPath);
  const pattern = REMOTE_GREP_PATTERNS.join("|");
  // wp-content 配下の PHP を対象に grep（行番号付き、最大500件）
  const cmd =
    `grep -rEnI --include='*.php' ${shellEscape(pattern)} ` +
    `${wpPath}/wp-content/plugins ${wpPath}/wp-content/themes ${wpPath}/wp-content/mu-plugins 2>/dev/null | head -500 || true`;

  try {
    const { stdout } = await executeRemoteCommand(target, cmd, 120000);
    const issues: SecurityFileScanIssue[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      // 形式: /path/file.php:123:matched line
      const m = line.match(/^(.*?):(\d+):(.*)$/);
      if (!m) continue;
      const [, filePath, lineNo, snippet] = m;
      issues.push({
        path: filePath.replace(target.wordpressPath, "").replace(/^\//, ""),
        line: parseInt(lineNo, 10),
        pattern: detectPattern(snippet),
        snippet: snippet.trim().slice(0, 120),
      });
    }
    return {
      scannedDirs: ["wp-content/plugins", "wp-content/themes", "wp-content/mu-plugins"],
      filesScanned: new Set(issues.map((i) => i.path)).size,
      issues,
    };
  } catch {
    return { scannedDirs: [], filesScanned: 0, issues: [] };
  }
}

function detectPattern(snippet: string): string {
  if (/eval\s*\(/i.test(snippet)) return "eval";
  if (/base64_decode\s*\(/i.test(snippet)) return "base64_decode";
  if (/gzinflate\s*\(/i.test(snippet)) return "gzinflate";
  if (/str_rot13\s*\(/i.test(snippet)) return "str_rot13";
  if (/shell_exec\s*\(/i.test(snippet)) return "shell_exec";
  if (/passthru\s*\(/i.test(snippet)) return "passthru";
  if (/create_function\s*\(/i.test(snippet)) return "create_function";
  return "suspicious";
}

// ===========================================
// wp-config.php（リモート読み取り）
// ===========================================
async function checkRemoteWpConfig(target: DeployTarget): Promise<SecurityWpConfigResult> {
  const wpPath = shellEscape(target.wordpressPath);
  try {
    const { stdout } = await executeRemoteCommand(
      target,
      `cat ${wpPath}/wp-config.php 2>/dev/null || cat ${wpPath}/../wp-config.php 2>/dev/null || echo ''`,
      30000
    );
    if (!stdout.trim()) {
      return { checked: false, skippedReason: "wp-config.php が見つかりません", items: [] };
    }
    return analyzeWpConfig(stdout);
  } catch (error) {
    return {
      checked: false,
      skippedReason: error instanceof Error ? error.message : "取得失敗",
      items: [],
    };
  }
}

// ===========================================
// ユーティリティ
// ===========================================
function splitSections(stdout: string): Record<string, string> {
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
  return sections;
}

/** リモート固有チェックから追加の推奨事項を生成 */
function buildRemoteRecommendations(
  coreChecksum: ChecksumVerifyResult,
  pluginChecksum: ChecksumVerifyResult,
  perms: FilePermissionAuditResult
): SecurityRecommendation[] {
  const recs: SecurityRecommendation[] = [];

  if (coreChecksum.hasMismatch) {
    recs.push({
      id: "core-checksum-mismatch",
      level: "warning",
      title: "WordPressコアの整合性エラー",
      message:
        "コアファイルが公式チェックサムと一致しません。改ざんの可能性があります。`wp core download --force` での修復を検討してください。",
      detail: coreChecksum.mismatches.slice(0, 10),
    });
  }
  if (pluginChecksum.hasMismatch) {
    recs.push({
      id: "plugin-checksum-mismatch",
      level: "warning",
      title: "プラグインの整合性エラー",
      message:
        "公式配布版と一致しないプラグインファイルがあります。改ざんや不正な改変の可能性があります。",
      detail: pluginChecksum.mismatches.slice(0, 10),
    });
  }
  if (perms.wpConfigTooOpen) {
    recs.push({
      id: "wp-config-perms",
      level: "warning",
      title: "wp-config.php の権限が緩すぎます",
      message: `現在 ${perms.wpConfigPerms}。600 または 640 への変更を推奨します。`,
      detail: [perms.wpConfigPerms || ""],
    });
  }
  if ((perms.worldWritableCount ?? 0) > 0) {
    recs.push({
      id: "world-writable",
      level: "warning",
      title: "誰でも書き込み可能なファイルがあります",
      message: `${perms.worldWritableCount}件のファイルが world-writable (0002) です。権限を 644/664 等に修正してください。`,
      detail: perms.worldWritableSamples.slice(0, 10),
    });
  }

  return recs;
}

// ===========================================
// 総合リモートセキュリティスキャン
// ===========================================
export async function runRemoteSecurityScan(target: DeployTarget): Promise<RemoteSecurityScanResult> {
  const scannedAt = new Date().toISOString();
  const hasWpCli = target.wpCli?.available !== false;

  // バージョン情報（WP-CLI がある場合）
  let version: SecurityVersionInfo = { plugins: [], themes: [] };
  let versionSkippedReason: string | undefined;
  if (hasWpCli) {
    version = await getRemoteVersionInfo(target);
  } else {
    versionSkippedReason = "リモートに WP-CLI がないため、バージョン情報を取得できません";
  }

  // 並行実行（独立したチェック群）
  const [
    vulnerabilityChecks,
    coreChecksum,
    pluginChecksum,
    filePermissions,
    fileScan,
    securityHeaders,
    exposureChecks,
    wpConfigChecks,
  ] = await Promise.all([
    hasWpCli && (version.wordpress || version.plugins.length > 0)
      ? fetchVulnerabilityChecks(version).catch(() => [])
      : Promise.resolve([] as SecurityVulnerabilityCheck[]),
    hasWpCli ? verifyCoreChecksum(target) : Promise.resolve(skipped("WP-CLIなし")),
    hasWpCli ? verifyPluginChecksum(target) : Promise.resolve(skipped("WP-CLIなし")),
    auditFilePermissions(target),
    remoteFileScan(target),
    checkSecurityHeaders(target.vhost).catch(() => undefined),
    checkWordPressExposure(target.vhost).catch(() => undefined),
    checkRemoteWpConfig(target),
  ]);

  // 推奨事項を統合（既存ロジック + リモート固有）
  const recommendations = buildRecommendations(version, fileScan);
  recommendations.push(...buildRemoteRecommendations(coreChecksum, pluginChecksum, filePermissions));

  return {
    targetId: target.id,
    scannedAt,
    version,
    versionSkippedReason,
    vulnerabilityChecks,
    fileScan,
    coreChecksum,
    pluginChecksum,
    filePermissions,
    securityHeaders: securityHeaders as SecurityHeadersResult | undefined,
    exposureChecks: exposureChecks as SecurityExposureResult | undefined,
    wpConfigChecks,
    recommendations,
  };
}

function skipped(reason: string): ChecksumVerifyResult {
  return { checked: false, skippedReason: reason, hasMismatch: false, mismatches: [] };
}

// ===========================================
// 結果キャッシュ（data/security/{targetId}.json）
// ===========================================
async function securityDir(): Promise<string> {
  const dir = path.join(await resolveDataDir(), "security");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveRemoteSecurityResult(result: RemoteSecurityScanResult): Promise<void> {
  const dir = await securityDir();
  await fs.writeFile(path.join(dir, `${result.targetId}.json`), JSON.stringify(result, null, 2));
}

export async function getCachedRemoteSecurity(targetId: string): Promise<RemoteSecurityScanResult | null> {
  try {
    const dir = await securityDir();
    const content = await fs.readFile(path.join(dir, `${targetId}.json`), "utf-8");
    return JSON.parse(content) as RemoteSecurityScanResult;
  } catch {
    return null;
  }
}
