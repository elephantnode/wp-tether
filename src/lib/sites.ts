import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site } from "@/types";

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), "data");
const SITES_FILE = path.join(DATA_DIR, "sites.json");

interface SitesData {
  sites: Site[];
}

/**
 * ~/を実際のホームディレクトリに展開
 */
export function expandPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * サイト一覧を取得
 */
export async function getSites(): Promise<Site[]> {
  try {
    const content = await fs.readFile(SITES_FILE, "utf-8");
    const data: SitesData = JSON.parse(content);
    return data.sites;
  } catch {
    return [];
  }
}

/**
 * サイトを保存
 */
export async function saveSites(sites: Site[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SITES_FILE, JSON.stringify({ sites }, null, 2));
}

/**
 * サイトを追加
 */
export async function addSite(site: Site): Promise<void> {
  const sites = await getSites();
  sites.push(site);
  await saveSites(sites);
}

/**
 * サイトを取得
 */
export async function getSite(id: string): Promise<Site | undefined> {
  const sites = await getSites();
  return sites.find((s) => s.id === id);
}

/**
 * サイトを更新
 */
export async function updateSite(
  id: string,
  updates: Partial<Site>
): Promise<Site | undefined> {
  const sites = await getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) return undefined;

  sites[index] = { ...sites[index], ...updates, updatedAt: new Date().toISOString() };
  await saveSites(sites);
  return sites[index];
}

/**
 * サイトを削除
 */
export async function deleteSite(id: string): Promise<boolean> {
  const sites = await getSites();
  const filtered = sites.filter((s) => s.id !== id);
  if (filtered.length === sites.length) return false;

  await saveSites(filtered);
  return true;
}

/**
 * サイトのDockerコンテナの実際の稼働状態を取得
 * WordPressコンテナ（wordpress）が running かどうかで判定
 */
async function getActualContainerStatus(
  sitePath: string
): Promise<"running" | "stopped" | "error"> {
  try {
    // docker compose ps でコンテナの状態を確認
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "ps", "--format", "json"],
      { cwd: sitePath, timeout: 10000 }
    );

    if (!stdout.trim()) {
      return "stopped";
    }

    // 各行がJSONオブジェクト（Docker Compose v2の出力形式）
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      try {
        const container = JSON.parse(line);
        // wordpressコンテナの状態をチェック
        if (
          container.Service === "wordpress" ||
          container.Name?.includes("wordpress")
        ) {
          if (container.State === "running") {
            return "running";
          }
        }
      } catch {
        // JSON解析エラーは無視
      }
    }

    return "stopped";
  } catch {
    // docker compose psが失敗した場合（ディレクトリが存在しない等）
    return "stopped";
  }
}

/**
 * サイト一覧を実際のコンテナ状態と共に取得
 * 設定ファイルのstatusと実際のコンテナ状態が異なる場合は実際の状態を反映
 */
export async function getSitesWithActualStatus(): Promise<Site[]> {
  const sites = await getSites();

  // 並列でコンテナ状態をチェック
  const sitesWithStatus = await Promise.all(
    sites.map(async (site) => {
      // creating/error状態のサイトはそのまま（セットアップ中の可能性）
      if (site.status === "creating" || site.status === "error") {
        return site;
      }

      const actualStatus = await getActualContainerStatus(site.path);

      // 実際の状態と異なる場合は更新
      if (site.status !== actualStatus) {
        return { ...site, status: actualStatus };
      }

      return site;
    })
  );

  return sitesWithStatus;
}
