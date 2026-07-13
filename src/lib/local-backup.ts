import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import {
  DeployTarget,
  LocalBackupOptions,
  LocalBackupResult,
  BackupGeneration,
  BackupFileScope,
  BackupRestoreOptions,
  RemoteDbCapabilities,
} from "@/types";
import { resolveBackupDir } from "./app-config";
import { buildRsyncArgs, buildSSHOptions, buildRemotePath, SCOPE_PATHS } from "./sync";
import {
  detectRemoteCapabilities,
  exportRemoteDb,
  importRemoteDb,
  sanitizeMariaDbDump,
} from "./db-sync";
import { buildScpArgs } from "./remote-exec";

const execFileAsync = promisify(execFile);

/** 保持する世代数 */
const MAX_GENERATIONS = 7;

const FILE_SCOPES: BackupFileScope[] = ["uploads", "plugins", "themes", "languages"];

/** ファイル名に使えない文字のみ除去（日本語・ハイフン・ドットは保持、空白は _ に） */
function sanitizeSegment(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .trim();
}

/** vhost からホスト名（ドメイン）を取り出す。失敗時は SSH ホストにフォールバック */
function extractHost(target: DeployTarget): string {
  try {
    return new URL(target.vhost).hostname;
  } catch {
    return target.ssh?.host ?? "";
  }
}

/** {backupDir}/{host}-{name}_{shortId} を返す（作成する） */
async function targetBackupRoot(target: DeployTarget): Promise<string> {
  const base = await resolveBackupDir();
  const host = sanitizeSegment(extractHost(target));
  const name = sanitizeSegment(target.name) || "server";
  const shortId = target.id.slice(0, 8);
  const folder = `${host ? host + "-" : ""}${name}_${shortId}`;
  const dir = path.join(base, folder);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
}

/** ディレクトリ/ファイルの合計サイズ（バイト）を再帰計算 */
async function pathSize(target: string): Promise<number> {
  let total = 0;
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return 0;
  }
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    total += await pathSize(path.join(target, e.name));
  }
  return total;
}

/** rsync pull で1スコープをローカルへ取得 */
async function pullScope(
  target: DeployTarget,
  scope: BackupFileScope,
  localScopeDir: string,
  log: string[]
): Promise<void> {
  await fs.mkdir(localScopeDir, { recursive: true });
  const remotePath = buildRemotePath(target, SCOPE_PATHS[scope]);
  const sshOptions = buildSSHOptions(target);
  // バックアップは追加取得（削除しない）。ローカルの空ディレクトリへ pull。
  const args = buildRsyncArgs(
    localScopeDir.endsWith("/") ? localScopeDir : localScopeDir + "/",
    remotePath,
    "pull",
    target.exclude ?? [],
    sshOptions,
    false,
    "additive"
  );
  log.push(`$ rsync (pull ${scope})`);
  const { stdout, stderr } = await execFileAsync("rsync", args, {
    maxBuffer: 50 * 1024 * 1024,
  });
  if (stderr) log.push(stderr.trim());
  void stdout;
}

/** wp-config.php を scp でローカルへ取得（親ディレクトリも試行） */
async function pullWpConfig(
  target: DeployTarget,
  destFile: string,
  log: string[]
): Promise<boolean> {
  const { host, user } = target.ssh!;
  const candidates = [
    `${target.wordpressPath.replace(/\/$/, "")}/wp-config.php`,
    `${target.wordpressPath.replace(/\/$/, "")}/../wp-config.php`,
  ];

  for (const remote of candidates) {
    try {
      const scpArgs = buildScpArgs(target);
      scpArgs.push(`${user}@${host}:${remote}`, destFile);
      await execFileAsync("scp", scpArgs, { timeout: 60000 });
      log.push(`wp-config.php 取得: ${remote}`);
      return true;
    } catch {
      // 次の候補へ
    }
  }
  log.push("[警告] wp-config.php を取得できませんでした");
  return false;
}

/**
 * バックアップを取得（ファイル + wp-config + DB を世代保存）
 */
export async function runLocalBackup(
  target: DeployTarget,
  options: LocalBackupOptions
): Promise<LocalBackupResult> {
  const log: string[] = [];
  const id = generateTimestamp();

  try {
    const root = await targetBackupRoot(target);
    const genDir = path.join(root, id);
    const filesDir = path.join(genDir, "files");
    await fs.mkdir(filesDir, { recursive: true });

    const sizes: Record<string, number> = {};
    const includedScopes: BackupFileScope[] = [];

    // 1. ファイルスコープを pull
    for (const scope of options.fileScopes) {
      log.push(`\n=== ${scope} ===`);
      const localScopeDir = path.join(filesDir, scope);
      try {
        await pullScope(target, scope, localScopeDir, log);
        sizes[`files/${scope}`] = await pathSize(localScopeDir);
        includedScopes.push(scope);
      } catch (error) {
        log.push(`[エラー] ${scope}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 2. wp-config.php
    let hasWpConfig = false;
    if (options.includeWpConfig) {
      log.push(`\n=== wp-config.php ===`);
      const dest = path.join(genDir, "wp-config.php");
      hasWpConfig = await pullWpConfig(target, dest, log);
      if (hasWpConfig) sizes["wp-config.php"] = await pathSize(dest);
    }

    // 3. DB
    let hasDb = false;
    if (options.includeDb) {
      log.push(`\n=== database ===`);
      const caps: RemoteDbCapabilities = await detectRemoteCapabilities(target);
      const dbPath = path.join(genDir, "db.sql");
      try {
        await exportRemoteDb(target, caps, dbPath, !!options.excludeUsers);
        if (caps.dbType === "mariadb") {
          const sql = await fs.readFile(dbPath, "utf-8");
          await fs.writeFile(dbPath, sanitizeMariaDbDump(sql));
        }
        sizes["db.sql"] = await pathSize(dbPath);
        hasDb = true;
        log.push("DB エクスポート完了");
      } catch (error) {
        log.push(`[エラー] DB: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const totalBytes = Object.values(sizes).reduce((a, b) => a + b, 0);
    const generation: BackupGeneration = {
      id,
      createdAt: new Date().toISOString(),
      targetId: target.id,
      targetName: target.name,
      fileScopes: includedScopes,
      hasWpConfig,
      hasDb,
      totalBytes,
      sizes,
    };

    await fs.writeFile(path.join(genDir, "manifest.json"), JSON.stringify(generation, null, 2));
    log.push(`\n=== 完了（合計 ${formatBytes(totalBytes)}） ===`);

    await cleanupOldGenerations(root, log);

    return { success: true, generation, output: log.join("\n") };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.push(`\n[エラー] ${msg}`);
    return { success: false, output: log.join("\n"), error: msg };
  }
}

/** 古い世代を保持数まで削除 */
async function cleanupOldGenerations(root: string, log: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const gens = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
    for (let i = MAX_GENERATIONS; i < gens.length; i++) {
      await fs.rm(path.join(root, gens[i]), { recursive: true, force: true });
      log.push(`古い世代を削除: ${gens[i]}`);
    }
  } catch {
    // 無視
  }
}

/**
 * 世代一覧を取得（新しい順）
 */
export async function listBackupGenerations(target: DeployTarget): Promise<BackupGeneration[]> {
  const root = await targetBackupRoot(target);
  const generations: BackupGeneration[] = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const manifest = await fs.readFile(path.join(root, e.name, "manifest.json"), "utf-8");
        generations.push(JSON.parse(manifest) as BackupGeneration);
      } catch {
        // manifest 無しの世代はスキップ
      }
    }
  } catch {
    // ルート無し
  }
  generations.sort((a, b) => b.id.localeCompare(a.id));
  return generations;
}

/**
 * バックアップ世代を削除
 */
export async function deleteBackupGeneration(target: DeployTarget, generationId: string): Promise<boolean> {
  const root = await targetBackupRoot(target);
  const genDir = path.join(root, generationId);
  try {
    await fs.rm(genDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * バックアップから復元（ファイル push + DB import）
 */
export async function restoreBackup(
  target: DeployTarget,
  options: BackupRestoreOptions
): Promise<LocalBackupResult> {
  const log: string[] = [];
  try {
    const root = await targetBackupRoot(target);
    const genDir = path.join(root, options.generationId);
    await fs.access(genDir);

    const sshOptions = buildSSHOptions(target);

    // 1. ファイル復元（push）
    for (const scope of options.fileScopes) {
      const localScopeDir = path.join(genDir, "files", scope);
      try {
        await fs.access(localScopeDir);
      } catch {
        log.push(`[スキップ] ${scope}: バックアップに含まれていません`);
        continue;
      }
      log.push(`\n=== ${scope} 復元 ===`);
      const remotePath = buildRemotePath(target, SCOPE_PATHS[scope]);
      const args = buildRsyncArgs(
        localScopeDir.endsWith("/") ? localScopeDir : localScopeDir + "/",
        remotePath,
        "push",
        target.exclude ?? [],
        sshOptions,
        false,
        options.mode
      );
      const { stderr } = await execFileAsync("rsync", args, { maxBuffer: 50 * 1024 * 1024 });
      if (stderr) log.push(stderr.trim());
    }

    // 2. DB 復元（import）
    if (options.restoreDb) {
      const dbPath = path.join(genDir, "db.sql");
      try {
        await fs.access(dbPath);
        log.push(`\n=== DB 復元 ===`);
        const caps = await detectRemoteCapabilities(target);
        await importRemoteDb(target, caps, dbPath);
        log.push("DB インポート完了");
      } catch (error) {
        log.push(`[エラー] DB 復元: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    log.push(`\n=== 復元完了 ===`);
    return { success: true, output: log.join("\n") };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.push(`\n[エラー] ${msg}`);
    return { success: false, output: log.join("\n"), error: msg };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export { FILE_SCOPES, formatBytes };
