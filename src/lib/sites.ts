import fs from "fs/promises";
import path from "path";
import os from "os";
import { Site } from "@/types";

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
