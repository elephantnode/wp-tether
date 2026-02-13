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
      `mysql -h ${target.database.host} -u ${target.database.user} -p'${target.database.password}' -e "SELECT VERSION();" 2>/dev/null || echo ''`
    );
    const versionOutput = dbVersionResult.stdout.toLowerCase();
    if (versionOutput.includes("mariadb")) {
      capabilities.dbType = "mariadb";
    } else if (versionOutput.includes("mysql") || /\d+\.\d+\.\d+/.test(versionOutput)) {
      capabilities.dbType = "mysql";
    }
  } catch (error) {
    // エラーは無視して、検出できた分だけ返す
    console.error("Capability detection error:", error);
  }

  return capabilities;
}

/**
 * MariaDB 11.4+ のサンドボックスモードコメントを除去
 */
function sanitizeMariaDbDump(sql: string): string {
  // 1行目の /*999999\- enable the sandbox mode */ を削除
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

    // 最新MAX_BACKUPS件を保持、それ以外は削除
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
    // まずテーブル一覧を取得
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
    // 一時ファイルを削除
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
    // WP-CLIを使用
    const wpPath = capabilities.wpCliPath || "wp";
    if (excludeUsers) {
      // テーブル一覧を取得してユーザーテーブルを除外
      const listCmd = `cd '${wordpressPath}' && ${wpPath} db tables --format=csv`;
      const { stdout: tablesOutput } = await executeRemoteCommand(target, listCmd);

      const tables = tablesOutput
        .trim()
        .split(",")
        .filter((t) => !t.endsWith("_users") && !t.endsWith("_usermeta"))
        .join(",");

      command = `cd '${wordpressPath}' && ${wpPath} db export --tables=${tables} ${tempFile}`;
    } else {
      command = `cd '${wordpressPath}' && ${wpPath} db export ${tempFile}`;
    }
  } else if (capabilities.hasMariadbDump) {
    // mariadb-dumpを使用
    const ignoreTables = excludeUsers
      ? `--ignore-table=${database.name}.wp_users --ignore-table=${database.name}.wp_usermeta`
      : "";
    command = `mariadb-dump -h ${database.host} -u ${database.user} -p'${database.password}' ${ignoreTables} ${database.name} > ${tempFile}`;
  } else if (capabilities.hasMysqldump) {
    // mysqldumpを使用
    const ignoreTables = excludeUsers
      ? `--ignore-table=${database.name}.wp_users --ignore-table=${database.name}.wp_usermeta`
      : "";
    command = `mysqldump -h ${database.host} -u ${database.user} -p'${database.password}' ${ignoreTables} ${database.name} > ${tempFile}`;
  } else {
    throw new Error("リモートサーバーにDB操作ツールがありません（WP-CLI, mysqldump, mariadb-dump のいずれかが必要です）");
  }

  // エクスポート実行
  await executeRemoteCommand(target, command, 300000); // 5分タイムアウト

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
    command = `cd '${wordpressPath}' && ${wpPath} db import ${tempFile}`;
  } else {
    command = `mysql -h ${database.host} -u ${database.user} -p'${database.password}' ${database.name} < ${tempFile}`;
  }

  try {
    await executeRemoteCommand(target, command, 300000);
  } finally {
    // リモートの一時ファイルを削除
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
  const command = `cd '${target.wordpressPath}' && ${wpPath} search-replace '${oldUrl}' '${newUrl}' --all-tables --precise ${dryRunFlag}`;

  const { stdout, stderr } = await executeRemoteCommand(target, command, 300000);
  return stdout + (stderr ? `\n${stderr}` : "");
}

/**
 * リモートバックアップディレクトリの相対パスを取得
 * セキュリティのため、Webルート外（ホームディレクトリ）に保存
 */
export function getRemoteBackupDirRelative(targetName: string): string {
  // サイト名をディレクトリ名に使用（安全な文字のみ）
  const safeName = targetName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `wp-tether-backups/${safeName}`;
}

/**
 * リモートのホームディレクトリを取得
 */
async function getRemoteHomeDir(target: DeployTarget): Promise<string> {
  const { stdout } = await executeRemoteCommand(target, "echo $HOME");
  return stdout.trim();
}

/**
 * リモートバックアップディレクトリのフルパスを取得
 */
export async function getRemoteBackupDir(target: DeployTarget): Promise<string> {
  const homeDir = await getRemoteHomeDir(target);
  const relativePath = getRemoteBackupDirRelative(target.name);
  return `${homeDir}/${relativePath}`;
}

/**
 * リモートDBのバックアップを作成
 */
async function backupRemoteDb(
  target: DeployTarget,
  capabilities: RemoteDbCapabilities
): Promise<string> {
  const { wordpressPath } = target;
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const backupDir = await getRemoteBackupDir(target);
  const backupPath = `${backupDir}/db_${timestamp}.sql`;

  // バックアップディレクトリ作成（ホームディレクトリ配下、Webアクセス不可）
  await executeRemoteCommand(target, `mkdir -p '${backupDir}'`);

  let command: string;

  if (capabilities.hasWpCli) {
    const wpPath = capabilities.wpCliPath || "wp";
    command = `cd '${wordpressPath}' && ${wpPath} db export '${backupPath}'`;
  } else if (capabilities.hasMariadbDump) {
    command = `mariadb-dump -h ${target.database.host} -u ${target.database.user} -p'${target.database.password}' ${target.database.name} > '${backupPath}'`;
  } else if (capabilities.hasMysqldump) {
    command = `mysqldump -h ${target.database.host} -u ${target.database.user} -p'${target.database.password}' ${target.database.name} > '${backupPath}'`;
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
    const remoteUrl = target.vhost.replace(/\/$/, ""); // 末尾スラッシュを削除
    const backupDir = await ensureBackupDir(site.path);
    const projectName = site.config.projectName;
    let backupPath: string | undefined;

    if (direction === "pull") {
      // Pull: サーバー → ローカル
      logs.push("\n=== Pull: サーバー → ローカル ===");

      // 1. ローカルのバックアップ
      if (createBackup) {
        logs.push("\nローカルDBをバックアップ中...");
        const backupFilename = generateBackupFilename("before_pull");
        backupPath = path.join(backupDir, backupFilename);
        await exportLocalDb(site.path, projectName, backupPath, false);
        logs.push(`  バックアップ完了: ${backupFilename}`);
        await cleanupOldBackups(backupDir);
      }

      // 2. リモートからエクスポート
      logs.push("\nリモートDBをエクスポート中...");
      const tempSqlPath = path.join(os.tmpdir(), `wp-tether-pull-${Date.now()}.sql`);
      await exportRemoteDb(target, capabilities, tempSqlPath, !includeUsers);
      logs.push("  エクスポート完了");

      // 3. MariaDBコメント除去
      if (capabilities.dbType === "mariadb") {
        logs.push("\nMariaDBコメントを除去中...");
        let sql = await fs.readFile(tempSqlPath, "utf-8");
        sql = sanitizeMariaDbDump(sql);
        await fs.writeFile(tempSqlPath, sql);
        logs.push("  完了");
      }

      if (!dryRun) {
        // 4. ローカルにインポート
        logs.push("\nローカルDBにインポート中...");
        await importLocalDb(site.path, projectName, tempSqlPath);
        logs.push("  インポート完了");

        // 5. search-replace（リモートURL → ローカルURL）
        logs.push(`\nURL置換中: ${remoteUrl} → ${localUrl}`);
        const replaceLog = await searchReplaceLocal(site.path, projectName, remoteUrl, localUrl, false);
        logs.push(replaceLog);
      } else {
        logs.push("\n[Dry Run] インポートとURL置換をスキップしました");
        logs.push(`  置換予定: ${remoteUrl} → ${localUrl}`);
      }

      // 一時ファイル削除
      await fs.unlink(tempSqlPath).catch(() => {});

    } else {
      // Push: ローカル → サーバー
      logs.push("\n=== Push: ローカル → サーバー ===");

      // 1. リモートのバックアップ
      if (createBackup) {
        logs.push("\nリモートDBをバックアップ中...");
        const remoteBackupPath = await backupRemoteDb(target, capabilities);
        logs.push(`  バックアップ完了: ${remoteBackupPath}`);
      }

      // 2. ローカルからエクスポート
      logs.push("\nローカルDBをエクスポート中...");
      const tempSqlPath = path.join(os.tmpdir(), `wp-tether-push-${Date.now()}.sql`);
      await exportLocalDb(site.path, projectName, tempSqlPath, !includeUsers);
      logs.push("  エクスポート完了");

      if (!dryRun) {
        // 3. リモートにインポート
        logs.push("\nリモートDBにインポート中...");
        await importRemoteDb(target, capabilities, tempSqlPath);
        logs.push("  インポート完了");

        // 4. search-replace（ローカルURL → リモートURL）
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

      // 一時ファイル削除
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

/**
 * リモートのバックアップ一覧を取得
 */
export async function listRemoteBackups(
  target: DeployTarget
): Promise<{ filename: string; createdAt: string; size: number }[]> {
  const backupDir = await getRemoteBackupDir(target);

  try {
    // ls -la でファイル一覧取得（タイムスタンプとサイズ付き）
    const { stdout } = await executeRemoteCommand(
      target,
      `ls -la '${backupDir}'/*.sql 2>/dev/null || echo ""`
    );

    if (!stdout.trim()) {
      return [];
    }

    const backups: { filename: string; createdAt: string; size: number }[] = [];
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      // -rw-r--r-- 1 user group 12345 Jan 15 10:30 filename.sql
      const match = line.match(/\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+\.sql)$/);
      if (match) {
        const [, size, dateStr, filepath] = match;
        const filename = filepath.split("/").pop() || filepath;
        backups.push({
          filename,
          createdAt: dateStr,
          size: parseInt(size, 10),
        });
      }
    }

    // 新しい順にソート（ファイル名にタイムスタンプが含まれているので逆順ソート）
    backups.sort((a, b) => b.filename.localeCompare(a.filename));

    return backups;
  } catch {
    return [];
  }
}

/**
 * リモートのバックアップを復元
 */
export async function restoreRemoteBackup(
  target: DeployTarget,
  filename: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const backupDir = await getRemoteBackupDir(target);
  const backupPath = `${backupDir}/${filename}`;
  const { wordpressPath } = target;
  const logs: string[] = [];

  try {
    // 能力を検出
    logs.push("リモートサーバーの能力を検出中...");
    const capabilities = await detectRemoteCapabilities(target);

    // バックアップファイルの存在確認
    logs.push(`\nバックアップファイルを確認: ${filename}`);
    const { stdout: checkResult } = await executeRemoteCommand(
      target,
      `test -f '${backupPath}' && echo "exists" || echo "not found"`
    );

    if (checkResult.trim() !== "exists") {
      throw new Error("バックアップファイルが見つかりません");
    }

    // 復元実行
    logs.push("\nデータベースを復元中...");

    let command: string;
    if (capabilities.hasWpCli) {
      const wpPath = capabilities.wpCliPath || "wp";
      command = `cd '${wordpressPath}' && ${wpPath} db import '${backupPath}'`;
    } else {
      command = `mysql -h ${target.database.host} -u ${target.database.user} -p'${target.database.password}' ${target.database.name} < '${backupPath}'`;
    }

    await executeRemoteCommand(target, command, 300000);
    logs.push("  復元完了");

    return {
      success: true,
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

/**
 * DB同期のプレビュー（dry-run）
 */
export async function previewDbSync(
  site: Site,
  target: DeployTarget,
  options: Omit<DbSyncOptions, "dryRun">
): Promise<DbSyncResult> {
  return executeDbSync(site, target, { ...options, dryRun: true });
}
