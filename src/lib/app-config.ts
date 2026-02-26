import fs from "fs/promises";
import path from "path";
import os from "os";

const APP_CONFIG_FILE = path.join(process.cwd(), "data", "app-config.json");
const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");

export interface AppConfig {
  /** データディレクトリの絶対パス（空文字 = デフォルト: data/） */
  dataDir: string;
}

const DEFAULT_CONFIG: AppConfig = {
  dataDir: "",
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

    // 後方互換: sitesJsonPath が設定されていれば dataDir に変換
    if (!data.dataDir && data.sitesJsonPath) {
      data.dataDir = path.dirname(expandConfigPath(data.sitesJsonPath));
    }

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
 * 設定に基づいた実際のデータディレクトリを返す
 */
export async function resolveDataDir(): Promise<string> {
  const config = await getAppConfig();
  if (config.dataDir) {
    return expandConfigPath(config.dataDir);
  }
  return DEFAULT_DATA_DIR;
}

export async function resolveSitesJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "sites.json");
}

export async function resolveDeployTargetsJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "deploy-targets.json");
}

export async function resolvePluginPresetsJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "plugin-presets.json");
}
