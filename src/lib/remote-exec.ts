import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { DeployTarget } from "@/types";

const execFileAsync = promisify(execFile);

// リモートコマンドのデフォルトタイムアウト（2分）
const DEFAULT_TIMEOUT_MS = 120000;
// SSH/SCP の出力バッファ上限（50MB）
const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * シェル用にシングルクォート内の文字列をエスケープ
 * シングルクォートを '\\'' に置換して安全に埋め込む
 */
export function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * SSH キーパスを展開（~ をホームディレクトリに置換）
 */
export function expandKeyPath(keyPath: string | undefined): string | undefined {
  if (!keyPath) return undefined;
  if (keyPath.startsWith("~/")) {
    return path.join(os.homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * SSHコマンドの引数を生成
 */
export function buildSSHArgs(
  target: DeployTarget,
  connectTimeoutSec: number = 30
): string[] {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { host, user, port } = target.ssh;
  const keyPath = expandKeyPath(target.ssh.keyPath);

  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-o", `ConnectTimeout=${connectTimeoutSec}`,
    "-p", String(port),
  ];

  if (keyPath) {
    args.push("-i", keyPath);
  }

  args.push(`${user}@${host}`);

  return args;
}

/**
 * SCPコマンドの引数を生成（接続オプションのみ。送受信パスは呼び出し側で push する）
 */
export function buildScpArgs(target: DeployTarget): string[] {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { port } = target.ssh;
  const keyPath = expandKeyPath(target.ssh.keyPath);

  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-P", String(port),
  ];

  if (keyPath) {
    args.push("-i", keyPath);
  }

  return args;
}

/**
 * リモートでコマンドを実行
 */
export async function executeRemoteCommand(
  target: DeployTarget,
  command: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  const sshArgs = buildSSHArgs(target);
  sshArgs.push(command);

  return execFileAsync("ssh", sshArgs, {
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER,
  });
}

/**
 * リモートの WordPress ディレクトリで WP-CLI を実行
 * `wpCli.path` が分かっている場合はそれを使い、なければ `wp` を使う。
 * 戻り値は stdout（trim 済み）と stderr。
 */
export async function runWpCli(
  target: DeployTarget,
  args: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  const wpPath = target.wpCli?.path || "wp";
  const command = `cd ${shellEscape(target.wordpressPath)} && ${wpPath} ${args}`;
  return executeRemoteCommand(target, command, timeoutMs);
}

/** SSH接続テストの結果 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

/**
 * SSH接続をテスト（短いタイムアウトで echo を実行）
 */
export async function testConnection(
  target: DeployTarget
): Promise<ConnectionTestResult> {
  if (!target.ssh) {
    return { success: false, message: "SSH設定がありません" };
  }

  try {
    const sshArgs = buildSSHArgs(target, 10);
    sshArgs.push('echo "wp-tether-ok"');

    const { stdout } = await execFileAsync("ssh", sshArgs, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });

    if (stdout.includes("wp-tether-ok")) {
      return { success: true, message: "接続成功" };
    }
    return { success: false, message: "予期しない応答: " + stdout.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}
