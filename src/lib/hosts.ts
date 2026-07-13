import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveHostsConfigJsonPath } from "./app-config";

const execFileAsync = promisify(execFile);

/** wp-tether が管理する /etc/hosts ブロックのマーカー */
export const BEGIN_MARKER = "# === wp-tether managed (do not edit inside) BEGIN ===";
export const END_MARKER = "# === wp-tether managed END ===";

/** プラットフォームごとの hosts ファイルパス */
export const HOSTS_PATH =
  process.platform === "win32"
    ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
    : "/etc/hosts";

interface HostsConfig {
  /** 有効化したいホスト名（desired state） */
  enabled: string[];
}

/**
 * /etc/hosts の全文を読む（通常権限で可能）
 */
export async function readHostsFile(): Promise<string> {
  return fs.readFile(HOSTS_PATH, "utf-8");
}

/**
 * 管理ブロック内の `127.0.0.1 <host>` からホスト名を抽出する
 */
export function parseManagedEntries(content: string): string[] {
  const begin = content.indexOf(BEGIN_MARKER);
  const end = content.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) return [];

  const block = content.slice(begin + BEGIN_MARKER.length, end);
  const hosts: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // "127.0.0.1 host1 host2" の形式に対応
    const parts = trimmed.split(/\s+/);
    for (const host of parts.slice(1)) {
      if (host) hosts.push(host);
    }
  }
  return hosts;
}

/**
 * 現在の hosts 全文をもとに、管理ブロックを与えられたホスト名で差し替えた全文を生成する。
 * - ホスト名が0件なら管理ブロックごと削除する
 * - 管理ブロックが無ければ末尾に追加する
 */
export function buildHostsContent(current: string, hostnames: string[]): string {
  // 既存の管理ブロックを取り除く
  let base = current;
  const begin = base.indexOf(BEGIN_MARKER);
  const end = base.indexOf(END_MARKER);
  if (begin !== -1 && end !== -1 && end >= begin) {
    const before = base.slice(0, begin).replace(/\s+$/, "");
    const after = base.slice(end + END_MARKER.length).replace(/^\s+/, "");
    base = after ? `${before}\n${after}` : before;
  }

  base = base.replace(/\s+$/, "");

  const unique = Array.from(new Set(hostnames.map((h) => h.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return base ? `${base}\n` : "";
  }

  const block = [
    BEGIN_MARKER,
    ...unique.map((h) => `127.0.0.1 ${h}`),
    END_MARKER,
  ].join("\n");

  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/**
 * 与えられたホスト名で /etc/hosts の管理ブロックを更新する。
 * macOS の管理者権限ダイアログを出して書き込む（root:wheel 644 を維持するため cp を使う）。
 */
export async function applyHosts(hostnames: string[]): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("この機能は現在 macOS のみ対応しています");
  }

  const current = await readHostsFile();
  const next = buildHostsContent(current, hostnames);

  const tmpPath = path.join(os.tmpdir(), "wp-tether-hosts.tmp");
  await fs.writeFile(tmpPath, next, "utf-8");

  // ファイル内容はシェル文字列に埋め込まず tmp 経由で cp（エスケープ事故を回避）
  const script = `do shell script "/bin/cp '${tmpPath}' '${HOSTS_PATH}'" with administrator privileges`;

  try {
    await execFileAsync("osascript", ["-e", script]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // ユーザーがパスワードダイアログをキャンセルした場合
    if (message.includes("-128") || message.includes("User canceled")) {
      throw new Error("CANCELED");
    }
    throw error;
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

/**
 * desired state（有効化したいホスト名）を data/hosts.json から取得
 */
export async function getEnabledHosts(): Promise<string[]> {
  try {
    const file = await resolveHostsConfigJsonPath();
    const content = await fs.readFile(file, "utf-8");
    const data: HostsConfig = JSON.parse(content);
    return Array.isArray(data.enabled) ? data.enabled : [];
  } catch {
    return [];
  }
}

/**
 * desired state を data/hosts.json に保存（sudo 不要）
 */
export async function setEnabledHosts(hostnames: string[]): Promise<void> {
  const file = await resolveHostsConfigJsonPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const unique = Array.from(new Set(hostnames.map((h) => h.trim()).filter(Boolean)));
  await fs.writeFile(file, JSON.stringify({ enabled: unique }, null, 2));
}
