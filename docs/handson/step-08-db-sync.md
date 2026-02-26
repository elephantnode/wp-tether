# Step 8：DB 同期

[← ハンズオン目次](README.md)

**ゴール**：ローカルとリモートサーバー間で WordPress のデータベースを同期する機能を実装する。WP-CLI、mysqldump、mariadb-dump を使い分け、URL の search-replace も自動で行う。

---

## 8-1. 型の定義

**何をするか**
DB 同期に必要な型を `src/types/index.ts` に追加する。

**手順**

`src/types/index.ts` に以下を追加する。

```typescript
// ===========================================
// DB同期
// ===========================================

/** DB同期オプション */
export interface DbSyncOptions {
  direction: "push" | "pull";
  includeUsers: boolean; // wp_users, wp_usermeta を含むか
  createBackup: boolean; // インポート前にバックアップを取るか
  dryRun?: boolean; // プレビューのみ（実行しない）
}

/** DB同期結果 */
export interface DbSyncResult {
  success: boolean;
  backupPath?: string; // 作成したバックアップのパス
  tablesAffected?: number;
  rowsAffected?: number;
  searchReplaceLog?: string;
  output?: string;
  error?: string;
}

/** リモートサーバーのDB操作能力 */
export interface RemoteDbCapabilities {
  hasWpCli: boolean;
  wpCliPath?: string;
  hasMysqldump: boolean;
  hasMariadbDump: boolean;
  dbType: "mysql" | "mariadb" | "unknown";
}
```

---

## 8-2. DB 同期ライブラリ（lib/db-sync.ts）

**何をするか**
DB 同期の実装を `src/lib/db-sync.ts` にまとめる。リモートの能力検出、エクスポート、インポート、search-replace を行う。

**手順**

`src/lib/db-sync.ts` を新規作成する。

```typescript
import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { DeployTarget, DbSyncOptions, DbSyncResult, RemoteDbCapabilities, Site } from "@/types";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// バックアップ保持数
const MAX_BACKUPS = 5;

/**
 * シェル用にシングルクォート内の文字列をエスケープ
 */
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * SSH キーパスを展開（~ をホームディレクトリに置換）
 */
function expandKeyPath(keyPath: string | undefined): string | undefined {
  if (!keyPath) return undefined;
  if (keyPath.startsWith("~/")) {
    return path.join(os.homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * SSHコマンドの引数を生成
 */
function buildSSHArgs(target: DeployTarget): string[] {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { host, user, port } = target.ssh;
  const keyPath = expandKeyPath(target.ssh.keyPath);

  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=30",
    "-p", String(port),
  ];

  if (keyPath) {
    args.push("-i", keyPath);
  }

  args.push(`${user}@${host}`);

  return args;
}

/**
 * リモートでコマンドを実行
 */
async function executeRemoteCommand(
  target: DeployTarget,
  command: string,
  timeoutMs: number = 120000
): Promise<{ stdout: string; stderr: string }> {
  const sshArgs = buildSSHArgs(target);
  sshArgs.push(command);

  return execFileAsync("ssh", sshArgs, {
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024, // 50MB
  });
}

/**
 * リモートサーバーのDB操作能力を検出
 */
export async function detectRemoteCapabilities(
  target: DeployTarget
): Promise<RemoteDbCapabilities> {
  const capabilities: RemoteDbCapabilities = {
    hasWpCli: false,
    hasMysqldump: false,
    hasMariadbDump: false,
    dbType: "unknown",
  };

  try {
    // WP-CLI の検出
    const wpCliResult = await executeRemoteCommand(
      target,
      "which wp 2>/dev/null || command -v wp 2>/dev/null || echo ''"
    );
    const wpCliPath = wpCliResult.stdout.trim();
    if (wpCliPath && !wpCliPath.includes("not found")) {
      capabilities.hasWpCli = true;
      capabilities.wpCliPath = wpCliPath;
    }

    // mysqldump の検出
    const mysqldumpResult = await executeRemoteCommand(
      target,
      "which mysqldump 2>/dev/null && echo 'found' || echo ''"
    );
    if (mysqldumpResult.stdout.includes("found")) {
      capabilities.hasMysqldump = true;
    }

    // mariadb-dump の検出
    const mariadbDumpResult = await executeRemoteCommand(
      target,
      "which mariadb-dump 2>/dev/null && echo 'found' || echo ''"
    );
    if (mariadbDumpResult.stdout.includes("found")) {
      capabilities.hasMariadbDump = true;
    }

    // DB種別の検出
    const dbVersionResult = await executeRemoteCommand(
      target,
      `mysql -h ${shellEscape(target.database.host)} -u ${shellEscape(target.database.user)} -p${shellEscape(target.database.password)} -e "SELECT VERSION();" 2>/dev/null || echo ''`
    );
    const versionOutput = dbVersionResult.stdout.toLowerCase();
    if (versionOutput.includes("mariadb")) {
      capabilities.dbType = "mariadb";
    } else if (versionOutput.includes("mysql") || /\d+\.\d+\.\d+/.test(versionOutput)) {
      capabilities.dbType = "mysql";
    }
  } catch (error) {
    console.error("Capability detection error:", error);
  }

  return capabilities;
}

/**
 * MariaDB 11.4+ のサンドボックスモードコメントを除去
 */
function sanitizeMariaDbDump(sql: string): string {
  return sql.replace(/^\/\*999999\\?-[^*]*\*\/\s*/m, "");
}

/**
 * ローカルサイトのURLを取得
 */
function getLocalSiteUrl(site: Site): string {
  if (site.config.hostnameMode === "localhost") {
    return `http://localhost:${site.config.port}`;
  }
  return `https://${site.config.hostname}`;
}

/**
 * バックアップディレクトリを取得・作成
 */
async function ensureBackupDir(sitePath: string): Promise<string> {
  const backupDir = path.join(sitePath, "backups", "db");
  await fs.mkdir(backupDir, { recursive: true });
  return backupDir;
}

/**
 * 古いバックアップを削除（最新N件を保持）
 */
async function cleanupOldBackups(backupDir: string): Promise<void> {
  try {
    const files = await fs.readdir(backupDir);
    const sqlFiles = files
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .reverse();

    for (let i = MAX_BACKUPS; i < sqlFiles.length; i++) {
      await fs.unlink(path.join(backupDir, sqlFiles[i]));
    }
  } catch {
    // バックアップディレクトリがない場合は無視
  }
}

/**
 * タイムスタンプ付きのバックアップファイル名を生成
 */
function generateBackupFilename(prefix: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  return `${timestamp}_${prefix}.sql`;
}

/**
 * ローカルDBをエクスポート（WP-CLI経由）
 */
async function exportLocalDb(
  sitePath: string,
  projectName: string,
  outputPath: string,
  excludeUsers: boolean
): Promise<void> {
  let command: string;

  if (excludeUsers) {
    // ユーザーテーブルを除外してエクスポート
    const listTablesCmd = `docker compose -p ${projectName} run --rm wpcli db tables --format=csv`;
    const { stdout: tablesOutput } = await execAsync(listTablesCmd, { cwd: sitePath });

    const tables = tablesOutput
      .trim()
      .split(",")
      .filter((t) => !t.endsWith("_users") && !t.endsWith("_usermeta"))
      .join(",");

    command = `docker compose -p ${projectName} run --rm wpcli db export --tables=${tables} /var/www/html/wp-content/db-export.sql`;
  } else {
    command = `docker compose -p ${projectName} run --rm wpcli db export /var/www/html/wp-content/db-export.sql`;
  }

  await execAsync(command, { cwd: sitePath });

  // エクスポートしたファイルを指定の場所に移動
  const exportedFile = path.join(sitePath, "src", "wp-content", "db-export.sql");
  await fs.rename(exportedFile, outputPath);
}

/**
 * ローカルDBにインポート（WP-CLI経由）
 */
async function importLocalDb(
  sitePath: string,
  projectName: string,
  sqlPath: string
): Promise<void> {
  // SQLファイルをwp-content配下にコピー
  const tempPath = path.join(sitePath, "src", "wp-content", "db-import.sql");
  await fs.copyFile(sqlPath, tempPath);

  try {
    const command = `docker compose -p ${projectName} run --rm wpcli db import /var/www/html/wp-content/db-import.sql`;
    await execAsync(command, { cwd: sitePath });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

/**
 * ローカルでsearch-replaceを実行
 */
async function searchReplaceLocal(
  sitePath: string,
  projectName: string,
  oldUrl: string,
  newUrl: string,
  dryRun: boolean
): Promise<string> {
  const dryRunFlag = dryRun ? "--dry-run" : "";
  const command = `docker compose -p ${projectName} run --rm wpcli search-replace '${oldUrl}' '${newUrl}' --all-tables --precise ${dryRunFlag}`;

  const { stdout, stderr } = await execAsync(command, { cwd: sitePath });
  return stdout + (stderr ? `\n${stderr}` : "");
}

/**
 * リモートDBをエクスポート
 */
async function exportRemoteDb(
  target: DeployTarget,
  capabilities: RemoteDbCapabilities,
  outputPath: string,
  excludeUsers: boolean
): Promise<void> {
  let command: string;
  const { database, wordpressPath } = target;
  const tempFile = "/tmp/wp-tether-db-export.sql";

  if (capabilities.hasWpCli) {
    const wpPath = capabilities.wpCliPath || "wp";
    if (excludeUsers) {
      const listCmd = `cd ${shellEscape(wordpressPath)} && ${wpPath} db tables --format=csv`;
      const { stdout: tablesOutput } = await executeRemoteCommand(target, listCmd);

      const tables = tablesOutput
        .trim()
        .split(",")
        .filter((t) => !t.endsWith("_users") && !t.endsWith("_usermeta"))
        .join(",");

      command = `cd ${shellEscape(wordpressPath)} && ${wpPath} db export --tables=${tables} ${tempFile}`;
    } else {
      command = `cd ${shellEscape(wordpressPath)} && ${wpPath} db export ${tempFile}`;
    }
  } else if (capabilities.hasMariadbDump) {
    const ignoreTables = excludeUsers
      ? `--ignore-table=${shellEscape(database.name)}.wp_users --ignore-table=${shellEscape(database.name)}.wp_usermeta`
      : "";
    command = `mariadb-dump -h ${shellEscape(database.host)} -u ${shellEscape(database.user)} -p${shellEscape(database.password)} ${ignoreTables} ${shellEscape(database.name)} > ${tempFile}`;
  } else if (capabilities.hasMysqldump) {
    const ignoreTables = excludeUsers
      ? `--ignore-table=${shellEscape(database.name)}.wp_users --ignore-table=${shellEscape(database.name)}.wp_usermeta`
      : "";
    command = `mysqldump -h ${shellEscape(database.host)} -u ${shellEscape(database.user)} -p${shellEscape(database.password)} ${ignoreTables} ${shellEscape(database.name)} > ${tempFile}`;
  } else {
    throw new Error("リモートサーバーにDB操作ツールがありません（WP-CLI, mysqldump, mariadb-dump のいずれかが必要です）");
  }

  await executeRemoteCommand(target, command, 300000);

  // SCPでローカルにダウンロード
  const { host, user, port } = target.ssh!;
  const keyPath = expandKeyPath(target.ssh!.keyPath);

  const scpArgs = [
    "-o", "StrictHostKeyChecking=no",
    "-P", String(port),
  ];
  if (keyPath) {
    scpArgs.push("-i", keyPath);
  }
  scpArgs.push(`${user}@${host}:${tempFile}`, outputPath);

  await execFileAsync("scp", scpArgs, { timeout: 300000 });

  // リモートの一時ファイルを削除
  await executeRemoteCommand(target, `rm -f ${tempFile}`).catch(() => {});
}

/**
 * リモートDBにインポート
 */
async function importRemoteDb(
  target: DeployTarget,
  capabilities: RemoteDbCapabilities,
  sqlPath: string
): Promise<void> {
  const { database, wordpressPath } = target;
  const tempFile = "/tmp/wp-tether-db-import.sql";

  // SCPでリモートにアップロード
  const { host, user, port } = target.ssh!;
  const keyPath = expandKeyPath(target.ssh!.keyPath);

  const scpArgs = [
    "-o", "StrictHostKeyChecking=no",
    "-P", String(port),
  ];
  if (keyPath) {
    scpArgs.push("-i", keyPath);
  }
  scpArgs.push(sqlPath, `${user}@${host}:${tempFile}`);

  await execFileAsync("scp", scpArgs, { timeout: 300000 });

  // インポート実行
  let command: string;

  if (capabilities.hasWpCli) {
    const wpPath = capabilities.wpCliPath || "wp";
    command = `cd ${shellEscape(wordpressPath)} && ${wpPath} db import ${tempFile}`;
  } else {
    command = `mysql -h ${shellEscape(database.host)} -u ${shellEscape(database.user)} -p${shellEscape(database.password)} ${shellEscape(database.name)} < ${tempFile}`;
  }

  try {
    await executeRemoteCommand(target, command, 300000);
  } finally {
    await executeRemoteCommand(target, `rm -f ${tempFile}`).catch(() => {});
  }
}

/**
 * リモートでsearch-replaceを実行
 */
async function searchReplaceRemote(
  target: DeployTarget,
  capabilities: RemoteDbCapabilities,
  oldUrl: string,
  newUrl: string,
  dryRun: boolean
): Promise<string> {
  if (!capabilities.hasWpCli) {
    throw new Error("リモートサーバーにWP-CLIがないため、search-replaceを実行できません");
  }

  const wpPath = capabilities.wpCliPath || "wp";
  const dryRunFlag = dryRun ? "--dry-run" : "";
  const command = `cd ${shellEscape(target.wordpressPath)} && ${wpPath} search-replace ${shellEscape(oldUrl)} ${shellEscape(newUrl)} --all-tables --precise ${dryRunFlag}`;

  const { stdout, stderr } = await executeRemoteCommand(target, command, 300000);
  return stdout + (stderr ? `\n${stderr}` : "");
}

/**
 * リモートのホームディレクトリを取得
 */
async function getRemoteHomeDir(target: DeployTarget): Promise<string> {
  const { stdout } = await executeRemoteCommand(target, "echo $HOME");
  return stdout.trim();
}

/**
 * リモートバックアップディレクトリを取得
 */
export async function getRemoteBackupDir(target: DeployTarget, siteName: string, siteId: string): Promise<string> {
  const homeDir = await getRemoteHomeDir(target);
  const safeSiteName = siteName.replace(/[^a-zA-Z0-9_-]/g, "_") || "site";
  const safeTargetName = target.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${homeDir}/wp-tether-backups/${safeSiteName}_${siteId}/${safeTargetName}`;
}

/**
 * リモートDBのバックアップを作成
 */
async function backupRemoteDb(
  target: DeployTarget,
  siteName: string,
  siteId: string,
  capabilities: RemoteDbCapabilities
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const backupDir = await getRemoteBackupDir(target, siteName, siteId);
  const backupPath = `${backupDir}/db_${timestamp}.sql`;

  await executeRemoteCommand(target, `mkdir -p ${shellEscape(backupDir)}`);

  let command: string;

  if (capabilities.hasWpCli) {
    const wpPath = capabilities.wpCliPath || "wp";
    command = `cd ${shellEscape(target.wordpressPath)} && ${wpPath} db export ${shellEscape(backupPath)}`;
  } else if (capabilities.hasMariadbDump) {
    command = `mariadb-dump -h ${shellEscape(target.database.host)} -u ${shellEscape(target.database.user)} -p${shellEscape(target.database.password)} ${shellEscape(target.database.name)} > ${shellEscape(backupPath)}`;
  } else if (capabilities.hasMysqldump) {
    command = `mysqldump -h ${shellEscape(target.database.host)} -u ${shellEscape(target.database.user)} -p${shellEscape(target.database.password)} ${shellEscape(target.database.name)} > ${shellEscape(backupPath)}`;
  } else {
    throw new Error("バックアップを作成できるツールがありません");
  }

  await executeRemoteCommand(target, command, 300000);
  return backupPath;
}

/**
 * DB同期を実行
 */
export async function executeDbSync(
  site: Site,
  target: DeployTarget,
  options: DbSyncOptions
): Promise<DbSyncResult> {
  const { direction, includeUsers, createBackup, dryRun } = options;
  const logs: string[] = [];

  try {
    // リモートの能力を検出
    logs.push("リモートサーバーの能力を検出中...");
    const capabilities = await detectRemoteCapabilities(target);
    logs.push(`  WP-CLI: ${capabilities.hasWpCli ? "あり" : "なし"}`);
    logs.push(`  mysqldump: ${capabilities.hasMysqldump ? "あり" : "なし"}`);
    logs.push(`  mariadb-dump: ${capabilities.hasMariadbDump ? "あり" : "なし"}`);
    logs.push(`  DB種別: ${capabilities.dbType}`);

    const localUrl = getLocalSiteUrl(site);
    const remoteUrl = target.vhost.replace(/\/$/, "");
    const backupDir = await ensureBackupDir(site.path);
    const projectName = site.config.projectName;
    let backupPath: string | undefined;

    if (direction === "pull") {
      // Pull: サーバー → ローカル
      logs.push("\n=== Pull: サーバー → ローカル ===");

      if (createBackup) {
        logs.push("\nローカルDBをバックアップ中...");
        const backupFilename = generateBackupFilename("before_pull");
        backupPath = path.join(backupDir, backupFilename);
        await exportLocalDb(site.path, projectName, backupPath, false);
        logs.push(`  バックアップ完了: ${backupFilename}`);
        await cleanupOldBackups(backupDir);
      }

      logs.push("\nリモートDBをエクスポート中...");
      const tempSqlPath = path.join(os.tmpdir(), `wp-tether-pull-${Date.now()}.sql`);
      await exportRemoteDb(target, capabilities, tempSqlPath, !includeUsers);
      logs.push("  エクスポート完了");

      if (capabilities.dbType === "mariadb") {
        logs.push("\nMariaDBコメントを除去中...");
        let sql = await fs.readFile(tempSqlPath, "utf-8");
        sql = sanitizeMariaDbDump(sql);
        await fs.writeFile(tempSqlPath, sql);
        logs.push("  完了");
      }

      if (!dryRun) {
        logs.push("\nローカルDBにインポート中...");
        await importLocalDb(site.path, projectName, tempSqlPath);
        logs.push("  インポート完了");

        logs.push(`\nURL置換中: ${remoteUrl} → ${localUrl}`);
        const replaceLog = await searchReplaceLocal(site.path, projectName, remoteUrl, localUrl, false);
        logs.push(replaceLog);
      } else {
        logs.push("\n[Dry Run] インポートとURL置換をスキップしました");
        logs.push(`  置換予定: ${remoteUrl} → ${localUrl}`);
      }

      await fs.unlink(tempSqlPath).catch(() => {});

    } else {
      // Push: ローカル → サーバー
      logs.push("\n=== Push: ローカル → サーバー ===");

      if (createBackup) {
        logs.push("\nリモートDBをバックアップ中...");
        const remoteBackupPath = await backupRemoteDb(target, site.name, site.id, capabilities);
        logs.push(`  バックアップ完了: ${remoteBackupPath}`);
      }

      logs.push("\nローカルDBをエクスポート中...");
      const tempSqlPath = path.join(os.tmpdir(), `wp-tether-push-${Date.now()}.sql`);
      await exportLocalDb(site.path, projectName, tempSqlPath, !includeUsers);
      logs.push("  エクスポート完了");

      if (!dryRun) {
        logs.push("\nリモートDBにインポート中...");
        await importRemoteDb(target, capabilities, tempSqlPath);
        logs.push("  インポート完了");

        if (capabilities.hasWpCli) {
          logs.push(`\nURL置換中: ${localUrl} → ${remoteUrl}`);
          const replaceLog = await searchReplaceRemote(target, capabilities, localUrl, remoteUrl, false);
          logs.push(replaceLog);
        } else {
          logs.push("\n[警告] リモートにWP-CLIがないため、URL置換はスキップされました");
          logs.push("手動でsearch-replaceを実行してください");
        }
      } else {
        logs.push("\n[Dry Run] インポートとURL置換をスキップしました");
        logs.push(`  置換予定: ${localUrl} → ${remoteUrl}`);
      }

      await fs.unlink(tempSqlPath).catch(() => {});
    }

    logs.push("\n=== 完了 ===");

    return {
      success: true,
      backupPath,
      output: logs.join("\n"),
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`\n[エラー] ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      output: logs.join("\n"),
    };
  }
}
```

**ポイント**

| 関数 | 役割 |
|------|------|
| `detectRemoteCapabilities()` | リモートの WP-CLI / mysqldump / mariadb-dump を検出 |
| `exportLocalDb()` | ローカル DB を WP-CLI でエクスポート |
| `importLocalDb()` | ローカル DB に WP-CLI でインポート |
| `searchReplaceLocal()` | ローカルで URL を search-replace |
| `exportRemoteDb()` | リモート DB をエクスポートして SCP でダウンロード |
| `importRemoteDb()` | SCP でアップロードしてリモート DB にインポート |
| `searchReplaceRemote()` | リモートで URL を search-replace |
| `executeDbSync()` | Pull/Push の全フローを実行 |

**MariaDB 11.4+ 対応**
MariaDB 11.4 以降では、ダンプの先頭に `/*999999\- enable the sandbox mode */` というコメントが付く。これを MySQL にインポートするとエラーになるため、`sanitizeMariaDbDump()` で除去する。

---

## 8-3. DB 同期 API

**何をするか**
**POST /api/db-sync** で DB 同期を実行する。

**手順**

`src/app/api/db-sync/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DbSyncOptions } from "@/types";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";
import { executeDbSync } from "@/lib/db-sync";

interface DbSyncRequest {
  targetId: string;
  direction: "push" | "pull";
  includeUsers?: boolean;
  createBackup?: boolean;
  dryRun?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: DbSyncRequest = await request.json();

    if (!body.targetId || !body.direction) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    const target = await getDeployTarget(body.targetId);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    const site = await getSite(target.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    if (target.type !== "ssh") {
      return NextResponse.json(
        { error: "現在SSH接続のみサポートしています" },
        { status: 400 }
      );
    }

    // サイトが起動中か確認（Pull時のみ必須ではないが、推奨）
    if (body.direction === "push" && site.status !== "running") {
      return NextResponse.json(
        { error: "サイトを起動してからDB同期を実行してください" },
        { status: 400 }
      );
    }

    const options: DbSyncOptions = {
      direction: body.direction,
      includeUsers: body.includeUsers ?? false,
      createBackup: body.createBackup ?? true,
      dryRun: body.dryRun ?? false,
    };

    const result = await executeDbSync(site, target, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error("DB sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DB同期に失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**
- デプロイターゲットを登録したうえで、POST /api/db-sync に以下を渡すと DB 同期が実行される。

```bash
curl -X POST http://localhost:3000/api/db-sync \
  -H "Content-Type: application/json" \
  -d '{
    "targetId": "ターゲットID",
    "direction": "pull",
    "includeUsers": false,
    "createBackup": true,
    "dryRun": true
  }'
```

---

## 8-4. DB 同期ダイアログコンポーネント

**何をするか**
サイトカードやデプロイターゲットカードから呼び出せる DB 同期ダイアログを実装する。

**手順**

`src/components/db-sync-dialog.tsx` を新規作成する。

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, ArrowDown, ArrowUp } from "lucide-react";

interface DbSyncDialogProps {
  targetId: string;
  targetName: string;
  siteName: string;
  vhost: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DbSyncDialog({
  targetId,
  targetName,
  siteName,
  vhost,
  isOpen,
  onClose,
}: DbSyncDialogProps) {
  const router = useRouter();
  const [direction, setDirection] = useState<"push" | "pull">("pull");
  const [includeUsers, setIncludeUsers] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output: string } | null>(null);

  if (!isOpen) return null;

  async function handleSync(dryRun: boolean) {
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/db-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          direction,
          includeUsers,
          createBackup,
          dryRun,
        }),
      });

      const data = await res.json();
      setResult({
        success: data.success,
        output: data.output || data.error || "不明なエラー",
      });

      if (data.success && !dryRun) {
        router.refresh();
      }
    } catch (error) {
      setResult({
        success: false,
        output: error instanceof Error ? error.message : "エラーが発生しました",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5" />
          <h3 className="font-semibold text-lg">DB同期</h3>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          <p><strong>{siteName}</strong> ↔ <strong>{targetName}</strong> ({vhost})</p>
        </div>

        {/* 方向選択 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">同期方向</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "pull"}
                onChange={() => setDirection("pull")}
                className="w-4 h-4"
              />
              <ArrowDown className="w-4 h-4" />
              <span>Pull（サーバー → ローカル）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "push"}
                onChange={() => setDirection("push")}
                className="w-4 h-4"
              />
              <ArrowUp className="w-4 h-4" />
              <span>Push（ローカル → サーバー）</span>
            </label>
          </div>
        </div>

        {/* オプション */}
        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUsers}
              onChange={(e) => setIncludeUsers(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">ユーザーテーブル（wp_users, wp_usermeta）を含む</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createBackup}
              onChange={(e) => setCreateBackup(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">インポート前にバックアップを作成</span>
          </label>
        </div>

        {/* 結果表示 */}
        {result && (
          <div className="flex-1 overflow-auto mb-4">
            <div className={`p-3 rounded text-sm ${result.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              <pre className="whitespace-pre-wrap font-mono text-xs">{result.output}</pre>
            </div>
          </div>
        )}

        {/* ボタン */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2"
          >
            閉じる
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={isLoading}
            className="rounded border border-blue-600 text-blue-600 px-4 py-2 hover:bg-blue-50 disabled:opacity-50"
          >
            {isLoading ? "実行中..." : "プレビュー（Dry Run）"}
          </button>
          <button
            onClick={() => handleSync(false)}
            disabled={isLoading}
            className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "実行中..." : "同期実行"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**確認**
- デプロイターゲットカードに「DB同期」ボタンを追加し、クリックでダイアログを表示する。

---

---

## 8-5. DB バックアップ一覧・復元 API

**何をするか**
DB 同期の `createBackup: true` で自動作成されたバックアップを**一覧表示・手動復元**できる API を追加する。バックアップは `{サイトパス}/backups/db/*.sql` に保存されており、最大 5 件保持される（古いものから削除）。

**バックアップが自動作成されるタイミング**

- Pull 実行時（`createBackup: true`）：インポート前にローカル DB を `{サイトパス}/backups/db/{timestamp}_before_pull.sql` として保存
- Push 実行時（`createBackup: true`）：インポート前にリモート DB を `~/wp-tether-backups/{サイト名}/{ターゲット名}/db_{timestamp}.sql` として保存

**ローカル DB バックアップの一覧・復元 API**

```bash
mkdir -p src/app/api/sites/[id]/db-backups
```

`src/app/api/sites/[id]/db-backups/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sites/[id]/db-backups - ローカルDBバックアップ一覧
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const site = await getSite(id);
    if (!site) {
      return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
    }

    const backupDir = path.join(site.path, "backups", "db");
    let backups: { name: string; size: number; createdAt: string }[] = [];

    try {
      const files = await fs.readdir(backupDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort().reverse();

      backups = await Promise.all(
        sqlFiles.map(async (file) => {
          const stat = await fs.stat(path.join(backupDir, file));
          return {
            name: file,
            size: stat.size,
            createdAt: stat.mtime.toISOString(),
          };
        })
      );
    } catch {
      // バックアップディレクトリがない場合は空配列
    }

    return NextResponse.json({ backups });
  } catch (error) {
    return NextResponse.json(
      { error: "バックアップ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}
```

`src/app/api/sites/[id]/db-backups/restore/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";

const execAsync = promisify(exec);

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/db-backups/restore - ローカルDBバックアップから復元
 * body: { filename: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { filename } = await request.json();

    if (!filename || typeof filename !== "string" || !filename.endsWith(".sql")) {
      return NextResponse.json({ error: "無効なファイル名" }, { status: 400 });
    }

    // パストラバーサル防止: ファイル名にパス区切りが含まれないことを確認
    if (filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "無効なファイル名" }, { status: 400 });
    }

    const site = await getSite(id);
    if (!site) {
      return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
    }

    const backupPath = path.join(site.path, "backups", "db", filename);
    await fs.access(backupPath); // 存在確認

    // WP-CLI でインポート（ファイルを wp-content 配下にコピーして渡す）
    const tempPath = path.join(site.path, "src", "wp-content", "db-restore.sql");
    await fs.copyFile(backupPath, tempPath);
    try {
      await execAsync(
        `docker compose -p ${site.config.projectName} run --rm wpcli db import /var/www/html/wp-content/db-restore.sql`,
        { cwd: site.path }
      );
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "バックアップからの復元に失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**

- DB 同期（Pull）を `createBackup: true` で実行後、`GET /api/sites/[id]/db-backups` でバックアップ一覧が返ること。
- バックアップファイル名を指定して `POST /api/sites/[id]/db-backups/restore` を呼ぶと DB が復元されること。

---

## Step 8 のまとめと確認

- [ ] `DbSyncOptions`, `DbSyncResult`, `RemoteDbCapabilities` 型が定義されている
- [ ] `lib/db-sync.ts` に `detectRemoteCapabilities`, `executeDbSync` がある
- [ ] POST /api/db-sync で DB 同期を実行できる
- [ ] DB 同期ダイアログで Pull/Push、オプション指定、プレビュー、実行ができる
- [ ] MariaDB のサンドボックスモードコメントが除去される
- [ ] GET /api/sites/[id]/db-backups でバックアップ一覧が返る
- [ ] POST /api/sites/[id]/db-backups/restore でバックアップから DB を復元できる

**ここまでで Step 8 は完了です。**
次は [Step 9：トンネル・セキュリティスキャン](step-09-tunnel-security.md) に進んでください。
