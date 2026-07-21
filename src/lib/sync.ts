import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { DeployTarget, DeployDirection, DeployScope, SyncMode } from "@/types";

const execFileAsync = promisify(execFile);

/**
 * ホスト上で使う SSH キーパスに展開する（~ をホームディレクトリに置換）
 * SSH/rsync はホストで実行するため、鍵はコンテナに置かずホストのパスをそのまま使う。
 */
function expandKeyPathForHost(keyPath: string | undefined): string | undefined {
  if (!keyPath) return undefined;
  if (keyPath.startsWith("~/")) {
    return path.join(os.homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * スコープとWordPressパスのマッピング
 */
export const SCOPE_PATHS: Record<Exclude<DeployScope, "all" | "db">, string> = {
  themes: "wp-content/themes/",
  plugins: "wp-content/plugins/",
  uploads: "wp-content/uploads/",
  "mu-plugins": "wp-content/mu-plugins/",
  languages: "wp-content/languages/",
};

/**
 * デフォルトの除外パターン
 */
const DEFAULT_EXCLUDES = [
  ".git/",
  ".DS_Store",
  "node_modules/",
  "*.log",
  ".env",
  "Thumbs.db",
];

interface SyncOptions {
  sitePath: string;
  target: DeployTarget;
  direction: DeployDirection;
  scopes: DeployScope[];
  dryRun?: boolean;
  mode?: SyncMode;
  /** スコープごとに同期するアイテム名を指定。未指定またはemptyの場合はフォルダ全体を同期 */
  selectedItems?: Partial<Record<string, string[]>>;
}

interface SyncResult {
  success: boolean;
  scope: DeployScope;
  output: string;
  error?: string;
}

/**
 * rsyncコマンドの引数を生成
 */
export function buildRsyncArgs(
  localPath: string,
  remotePath: string,
  direction: DeployDirection,
  excludes: string[],
  sshOptions: string,
  dryRun: boolean,
  mode: SyncMode = "mirror"
): string[] {
  const args = [
    "-avz",
    "--omit-dir-times",
    "-e", sshOptions,
  ];

  // 同期モードに応じたフラグ
  switch (mode) {
    case "mirror":
      // 完全同期: 送信先を送信元と完全一致させる（削除も含む）
      args.push("--delete");
      break;
    case "additive":
      // 追加・更新のみ: 削除しない（デフォルトのrsync動作）
      break;
    case "update":
      // 新しいファイルのみ: 宛先が新しければスキップ
      args.push("--update");
      break;
  }

  // 除外パターン
  for (const pattern of excludes) {
    args.push("--exclude", pattern);
  }

  // dry-run
  if (dryRun) {
    args.push("--dry-run");
  }

  // 方向に応じてsourceとdestを設定
  if (direction === "push") {
    args.push(localPath, remotePath);
  } else {
    args.push(remotePath, localPath);
  }

  return args;
}

/**
 * SSH接続オプションを生成（ホストの ssh に渡す -e 用）
 */
export function buildSSHOptions(target: DeployTarget): string {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { port } = target.ssh;
  const keyPath = expandKeyPathForHost(target.ssh.keyPath);
  let sshCmd = `ssh -o StrictHostKeyChecking=no -p ${port}`;

  if (keyPath) {
    sshCmd += ` -i ${keyPath}`;
  }

  return sshCmd;
}

/**
 * リモートパスを生成 (user@host:/path/)
 */
export function buildRemotePath(target: DeployTarget, relativePath: string): string {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { host, user } = target.ssh;
  const fullPath = target.wordpressPath.endsWith("/")
    ? target.wordpressPath + relativePath
    : target.wordpressPath + "/" + relativePath;

  return `${user}@${host}:${fullPath}`;
}

/**
 * 単一アイテム（テーマ・プラグイン名）の同期を実行
 */
async function syncScopeItem(
  itemLocalPath: string,
  itemRemotePath: string,
  direction: DeployDirection,
  excludes: string[],
  sshOptions: string,
  dryRun: boolean,
  mode: SyncMode
): Promise<{ output: string; error?: string }> {
  try {
    const args = buildRsyncArgs(
      itemLocalPath,
      itemRemotePath,
      direction,
      excludes,
      sshOptions,
      dryRun,
      mode
    );
    const { stdout, stderr } = await execFileAsync("rsync", args, {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { output: stdout + (stderr ? `\n${stderr}` : "") };
  } catch (error) {
    return { output: "", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 単一スコープの同期を実行
 */
async function syncScope(
  sitePath: string,
  target: DeployTarget,
  scope: Exclude<DeployScope, "all" | "db">,
  direction: DeployDirection,
  dryRun: boolean,
  mode: SyncMode = "mirror",
  selectedItems?: string[]
): Promise<SyncResult> {
  try {
    const relativePath = SCOPE_PATHS[scope];
    const sshOptions = buildSSHOptions(target);
    const excludes = [...DEFAULT_EXCLUDES, ...(target.exclude ?? [])];

    // 選択アイテムが指定されている場合はアイテムごとに個別同期
    if (selectedItems && selectedItems.length > 0) {
      const outputs: string[] = [];
      let firstError: string | undefined;

      for (const item of selectedItems) {
        const itemLocalPath = `${sitePath}/src/${relativePath}${item}/`;
        const itemRemotePath = buildRemotePath(target, `${relativePath}${item}/`);
        const result = await syncScopeItem(
          itemLocalPath,
          itemRemotePath,
          direction,
          excludes,
          sshOptions,
          dryRun,
          mode
        );
        if (result.error) {
          firstError = `[${item}] ${result.error}`;
          break;
        }
        outputs.push(`--- ${item} ---\n${result.output}`);
      }

      if (firstError) {
        return { success: false, scope, output: outputs.join("\n"), error: firstError };
      }
      return { success: true, scope, output: outputs.join("\n") };
    }

    // 選択なし → フォルダ全体を同期
    const localPath = `${sitePath}/src/${relativePath}`;
    const remotePath = buildRemotePath(target, relativePath);
    const args = buildRsyncArgs(
      localPath,
      remotePath,
      direction,
      excludes,
      sshOptions,
      dryRun,
      mode
    );

    // ホストの rsync で実行（鍵はホストにのみ存在）
    const { stdout, stderr } = await execFileAsync("rsync", args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      success: true,
      scope,
      output: stdout + (stderr ? `\n${stderr}` : ""),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      scope,
      output: "",
      error: errorMessage,
    };
  }
}

/**
 * 同期を実行
 */
export async function executeSync(options: SyncOptions): Promise<SyncResult[]> {
  const { sitePath, target, direction, scopes, dryRun = false, mode = "mirror", selectedItems } = options;
  const results: SyncResult[] = [];

  // "all" が含まれている場合は全スコープに展開（dbを除く）
  let targetScopes: Exclude<DeployScope, "all" | "db">[];
  if (scopes.includes("all")) {
    targetScopes = ["themes", "plugins", "uploads", "mu-plugins", "languages"];
  } else {
    targetScopes = scopes.filter(
      (s): s is Exclude<DeployScope, "all" | "db"> => s !== "all" && s !== "db"
    );
  }

  // 各スコープを順番に同期
  for (const scope of targetScopes) {
    const scopeSelectedItems = selectedItems?.[scope];
    const result = await syncScope(sitePath, target, scope, direction, dryRun, mode, scopeSelectedItems);
    results.push(result);

    // エラーが発生した場合は中断
    if (!result.success) {
      break;
    }
  }

  return results;
}

/**
 * SSH接続テスト（ホストの ssh で実行、鍵はコンテナに置かない）
 */
export async function testSSHConnection(
  target: DeployTarget
): Promise<{ success: boolean; error?: string }> {
  if (!target.ssh) {
    return { success: false, error: "SSH設定がありません" };
  }

  try {
    const { host, user, port } = target.ssh;
    const keyPath = expandKeyPathForHost(target.ssh.keyPath);

    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(port),
    ];

    if (keyPath) {
      sshArgs.push("-i", keyPath);
    }

    sshArgs.push(`${user}@${host}`, "echo", "Connection successful");

    const { stdout } = await execFileAsync("ssh", sshArgs, {
      timeout: 30000, // 30秒タイムアウト
    });

    if (stdout.includes("Connection successful")) {
      return { success: true };
    }

    return { success: false, error: "接続は確立されましたが、応答が不正です" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * リモートのWordPressパスを検証（ホストの ssh で実行）
 */
export async function validateRemotePath(
  target: DeployTarget
): Promise<{ success: boolean; error?: string }> {
  if (!target.ssh) {
    return { success: false, error: "SSH設定がありません" };
  }

  try {
    const { host, user, port } = target.ssh;
    const keyPath = expandKeyPathForHost(target.ssh.keyPath);

    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(port),
    ];

    if (keyPath) {
      sshArgs.push("-i", keyPath);
    }

    const wpPath = target.wordpressPath.endsWith("/")
      ? target.wordpressPath.slice(0, -1)
      : target.wordpressPath;

    // wp-config.php は DocumentRoot 内、または親ディレクトリにある場合がある
    // (KUSANAGI などセキュリティ目的で親に配置するケース)
    const checkPath1 = wpPath + "/wp-config.php";
    const checkPath2 = wpPath.replace(/\/[^/]+$/, "") + "/wp-config.php";

    const quotedPath1 = "'" + checkPath1.replace(/'/g, "'\"'\"'") + "'";
    const quotedPath2 = "'" + checkPath2.replace(/'/g, "'\"'\"'") + "'";
    const remoteCmd = `(test -f ${quotedPath1} || test -f ${quotedPath2}) && echo valid`;
    sshArgs.push(`${user}@${host}`, remoteCmd);

    const { stdout } = await execFileAsync("ssh", sshArgs, {
      timeout: 30000,
    });

    if (stdout.includes("valid")) {
      return { success: true };
    }

    return { success: false, error: "wp-config.php が見つかりません" };
  } catch (error) {
    return { success: false, error: "パスの検証に失敗しました" };
  }
}
