import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { resolveDataDir, getAppConfig } from "./app-config";

const execFileAsync = promisify(execFile);

export type NotifyLevel = "info" | "warning" | "critical";

export interface NotifyOptions {
  title: string;
  message: string;
  level?: NotifyLevel;
  /** 関連サーバー（任意） */
  targetId?: string;
}

export interface StoredNotification extends NotifyOptions {
  id: string;
  level: NotifyLevel;
  createdAt: string;
  read: boolean;
}

const MAX_STORED = 200;

// ===========================================
// アプリ内通知ストア
// ===========================================

async function notificationsPath(): Promise<string> {
  return path.join(await resolveDataDir(), "notifications.json");
}

async function readStored(): Promise<StoredNotification[]> {
  try {
    const content = await fs.readFile(await notificationsPath(), "utf-8");
    return JSON.parse(content) as StoredNotification[];
  } catch {
    return [];
  }
}

async function writeStored(items: StoredNotification[]): Promise<void> {
  const file = await notificationsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(items.slice(0, MAX_STORED), null, 2));
}

export async function getNotifications(): Promise<StoredNotification[]> {
  return readStored();
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const items = await readStored();
  for (const item of items) {
    if (!ids || ids.includes(item.id)) {
      item.read = true;
    }
  }
  await writeStored(items);
}

// ===========================================
// macOS ネイティブ通知
// ===========================================

async function sendMacNotification(title: string, message: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const script = `display notification "${esc(message)}" with title "${esc(title)}"`;
  await execFileAsync("osascript", ["-e", script]).catch(() => {});
}

// ===========================================
// Slack
// ===========================================

/** レベルごとのサイドバー色 */
const SLACK_COLORS: Record<NotifyLevel, string> = {
  info: "#36a64f",
  warning: "#f0a500",
  critical: "#e01e5a",
};

const SLACK_LEVEL_LABELS: Record<NotifyLevel, string> = {
  info: "INFO",
  warning: "WARNING",
  critical: "CRITICAL",
};

async function sendSlack(webhookUrl: string, opts: NotifyOptions): Promise<void> {
  const level = opts.level ?? "info";
  const payload = {
    attachments: [
      {
        color: SLACK_COLORS[level],
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*[${SLACK_LEVEL_LABELS[level]}] ${opts.title}*\n${opts.message}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `wp-tether · ${new Date().toLocaleString("ja-JP")}`,
              },
            ],
          },
        ],
      },
    ],
  };
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ===========================================
// Google Chat
// ===========================================

/** レベルごとのヘッダー色（Google Chat Cards v2） */
const GCHAT_COLORS: Record<NotifyLevel, string> = {
  info: "#36a64f",
  warning: "#f0a500",
  critical: "#e01e5a",
};

const GCHAT_ICONS: Record<NotifyLevel, string> = {
  info: "INFO",
  warning: "WARNING",
  critical: "DESCRIPTION",
};

async function sendGoogleChat(webhookUrl: string, opts: NotifyOptions): Promise<void> {
  const level = opts.level ?? "info";
  const payload = {
    cardsV2: [
      {
        cardId: `wp-tether-${Date.now()}`,
        card: {
          header: {
            title: opts.title,
            subtitle: `wp-tether · ${SLACK_LEVEL_LABELS[level]}`,
            imageUrl: `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${GCHAT_ICONS[level]}/default/24px.svg`,
            imageType: "SQUARE",
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    text: opts.message,
                    startIcon: {
                      knownIcon: GCHAT_ICONS[level],
                      altText: level,
                    },
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  textParagraph: {
                    text: `<font color="${GCHAT_COLORS[level]}">●</font> ${new Date().toLocaleString("ja-JP")}`,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ===========================================
// レベル比較
// ===========================================

const LEVEL_ORDER: Record<NotifyLevel, number> = { info: 0, warning: 1, critical: 2 };

function meetsMinLevel(level: NotifyLevel, minLevel: NotifyLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

// ===========================================
// メイン送信関数
// ===========================================

/**
 * 通知を送信。
 * - 常にアプリ内ストアへ保存
 * - app-config の notify 設定に従い macOS / Slack / Google Chat へ送信
 * - minLevel 未満のものは外部送信しない（アプリ内には記録される）
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const level = opts.level ?? "info";

  // 1. アプリ内通知に保存（常に）
  const items = await readStored();
  const entry: StoredNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: opts.title,
    message: opts.message,
    level,
    targetId: opts.targetId,
    createdAt: new Date().toISOString(),
    read: false,
  };
  items.unshift(entry);
  await writeStored(items);

  // 2. 外部通知（minLevel チェック付き）
  const config = await getAppConfig();
  const nc = config.notify;
  if (!meetsMinLevel(level, nc.minLevel)) return;

  const tasks: Promise<void>[] = [];
  if (nc.macNotifications) {
    tasks.push(sendMacNotification(opts.title, opts.message));
  }
  if (nc.slackWebhookUrl) {
    tasks.push(sendSlack(nc.slackWebhookUrl, { ...opts, level }));
  }
  if (nc.googleChatWebhookUrl) {
    tasks.push(sendGoogleChat(nc.googleChatWebhookUrl, { ...opts, level }));
  }
  await Promise.allSettled(tasks);
}

/**
 * テスト通知を送信（設定 UI から呼び出す）
 * アプリ内ストアには保存せず、外部チャネルへの疎通確認のみ行う
 */
export async function sendTestNotification(
  channel: "slack" | "google_chat" | "mac",
  webhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const opts: NotifyOptions = {
    title: "wp-tether テスト通知",
    message: "通知の疎通確認です。この通知が届いたら設定完了です。",
    level: "info",
  };
  try {
    if (channel === "slack" && webhookUrl) {
      await sendSlack(webhookUrl, opts);
    } else if (channel === "google_chat" && webhookUrl) {
      await sendGoogleChat(webhookUrl, opts);
    } else if (channel === "mac") {
      await sendMacNotification(opts.title, opts.message);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "送信失敗" };
  }
}
