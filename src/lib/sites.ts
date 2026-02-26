import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site } from "@/types";
import { resolveSitesJsonPath } from "./app-config";

const execFileAsync = promisify(execFile);

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
    const sitesFile = await resolveSitesJsonPath();
    const content = await fs.readFile(sitesFile, "utf-8");
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
  const sitesFile = await resolveSitesJsonPath();
  await fs.mkdir(path.dirname(sitesFile), { recursive: true });
  await fs.writeFile(sitesFile, JSON.stringify({ sites }, null, 2));
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
 * WordPressサービスのコンテナが running かどうかで判定
 *
 * Docker Compose v2 は NDJSON（1行1オブジェクト）または JSON 配列を出力する。
 * コンテナ名は ${PROJECT_NAME}_wp 形式のため _wp サフィックスでも照合する。
 * State フィールドのほか Status（"Up 2 hours" など）もフォールバックとして参照する。
 */
async function getActualContainerStatus(
  sitePath: string
): Promise<"running" | "stopped" | "error"> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "ps", "--format", "json"],
      { cwd: sitePath, timeout: 10000 }
    );

    if (!stdout.trim()) {
      return "stopped";
    }

    // 行ごとにパースして有効なコンテナオブジェクトをすべて収集する
    // NDJSON（1行1オブジェクト）と JSON 配列の両方に対応
    const containers: Record<string, unknown>[] = [];
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          containers.push(...parsed);
        } else if (parsed && typeof parsed === "object") {
          containers.push(parsed as Record<string, unknown>);
        }
      } catch {
        // JSON ではない行（"[" や "]" のみの行など）はスキップ
      }
    }

    for (const container of containers) {
      const service = container.Service;
      const name = typeof container.Name === "string" ? container.Name : "";

      const isWordPress =
        service === "wordpress" ||
        name.includes("wordpress") ||
        name.endsWith("_wp");

      if (!isWordPress) continue;

      const state = typeof container.State === "string" ? container.State : "";
      const status = typeof container.Status === "string" ? container.Status : "";

      if (
        state.toLowerCase() === "running" ||
        status.toLowerCase().startsWith("up")
      ) {
        return "running";
      }
    }

    return "stopped";
  } catch {
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
