import fs from "fs/promises";
import path from "path";
import os from "os";

const APP_CONFIG_FILE = path.join(process.cwd(), "data", "app-config.json");

export interface AppConfig {
  /** sites.json の絶対パス（空文字 = デフォルト: data/sites.json） */
  sitesJsonPath: string;
}

const DEFAULT_CONFIG: AppConfig = {
  sitesJsonPath: "",
};

export function expandConfigPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export async function getAppConfig(): Promise<AppConfig> {
  try {
    const content = await fs.readFile(APP_CONFIG_FILE, "utf-8");
    const data = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...data };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveAppConfig(config: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getAppConfig();
  const updated = { ...current, ...config };
  await fs.mkdir(path.dirname(APP_CONFIG_FILE), { recursive: true });
  await fs.writeFile(APP_CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * 設定に基づいた sites.json の実際のパスを返す
 * sitesJsonPath が空の場合はデフォルト (data/sites.json) を使用
 */
export async function resolveSitesJsonPath(): Promise<string> {
  const config = await getAppConfig();
  if (config.sitesJsonPath) {
    return expandConfigPath(config.sitesJsonPath);
  }
  return path.join(process.cwd(), "data", "sites.json");
}
