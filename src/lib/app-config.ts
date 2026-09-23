import fs from "fs/promises";
import path from "path";
import os from "os";

const APP_CONFIG_FILE = path.join(process.cwd(), "data", "app-config.json");
const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");

/** 通知チャネルの設定 */
export interface NotifyConfig {
  /** macOS ネイティブ通知を有効にするか（デフォルト true） */
  macNotifications: boolean;
  /** Slack Incoming Webhook URL */
  slackWebhookUrl: string;
  /** Google Chat Incoming Webhook URL */
  googleChatWebhookUrl: string;
  /** 送信する最低レベル（info / warning / critical）。これ未満は外部送信しない */
  minLevel: "info" | "warning" | "critical";
}

export interface AppConfig {
  /** データディレクトリの絶対パス（空文字 = デフォルト: data/） */
  dataDir: string;
  /** サーバーバックアップの保存先（空文字 = デフォルト: {dataDir}/backups/servers） */
  backupDir: string;
  /** 通知設定 */
  notify: NotifyConfig;
  /** 現在アクティブなターミナルアプリ名 */
  terminalApp: string;
  /** 登録済みターミナルアプリ一覧 */
  terminalApps: string[];
  /** 現在アクティブなエディタアプリ名 */
  editorApp: string;
  /** 登録済みエディタアプリ一覧 */
  editorApps: string[];
}

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  macNotifications: true,
  slackWebhookUrl: "",
  googleChatWebhookUrl: "",
  minLevel: "warning",
};

const DEFAULT_CONFIG: AppConfig = {
  dataDir: "",
  backupDir: "",
  notify: DEFAULT_NOTIFY_CONFIG,
  terminalApp: "Terminal",
  terminalApps: ["Terminal"],
  editorApp: "Visual Studio Code",
  editorApps: ["Visual Studio Code"],
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

    return {
      ...DEFAULT_CONFIG,
      ...data,
      notify: { ...DEFAULT_NOTIFY_CONFIG, ...(data.notify ?? {}) },
    };
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

/**
 * サーバーバックアップの保存先ディレクトリを返す
 * 未設定時は {dataDir}/backups/servers
 */
export async function resolveBackupDir(): Promise<string> {
  const config = await getAppConfig();
  if (config.backupDir) {
    return expandConfigPath(config.backupDir);
  }
  return path.join(await resolveDataDir(), "backups", "servers");
}

export async function resolveDeployTargetsJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "deploy-targets.json");
}

export async function resolvePluginPresetsJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "plugin-presets.json");
}

export async function resolveHostsConfigJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "hosts.json");
}

export async function resolveSchedulerStateJsonPath(): Promise<string> {
  return path.join(await resolveDataDir(), "scheduler-state.json");
}
