import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

export type TunnelProvider = "cloudflared" | "ngrok";

export interface TunnelInfo {
  siteId: string;
  siteName: string;
  localPort: number;
  localUrl: string;
  publicUrl?: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
  provider?: TunnelProvider;
}

// アクティブなトンネルを管理（メモリ内）
const activeTunnels = new Map<string, { process: ChildProcess; info: TunnelInfo }>();
const tunnelEvents = new EventEmitter();

/**
 * コマンドがインストールされているか確認
 */
async function checkCommand(command: string, args: string[] = ["--version"]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * cloudflaredがインストールされているか確認
 */
export async function checkCloudflared(): Promise<boolean> {
  return checkCommand("cloudflared");
}

/**
 * ngrokがインストールされているか確認
 */
export async function checkNgrok(): Promise<boolean> {
  return checkCommand("ngrok", ["version"]);
}

/**
 * 利用可能なプロバイダーを取得
 */
export async function getAvailableProviders(): Promise<TunnelProvider[]> {
  const providers: TunnelProvider[] = [];

  if (await checkCloudflared()) {
    providers.push("cloudflared");
  }
  if (await checkNgrok()) {
    providers.push("ngrok");
  }

  return providers;
}

/**
 * cloudflaredでトンネルを開始
 */
async function startCloudflaredTunnel(
  siteId: string,
  info: TunnelInfo
): Promise<ChildProcess> {
  const args = ["tunnel", "--url", info.localUrl];

  // HTTPSの場合、自己署名証明書を許容
  if (info.localUrl.startsWith("https://")) {
    args.push("--no-tls-verify");
  }

  const proc = spawn("cloudflared", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // URLを取得（stderrに出力される）
  proc.stderr?.on("data", (data: Buffer) => {
    const output = data.toString();
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (urlMatch && !info.publicUrl) {
      info.publicUrl = urlMatch[0];
      info.status = "connected";
      info.provider = "cloudflared";
      tunnelEvents.emit("connected", siteId, info);
    }
  });

  return proc;
}

/**
 * ngrokでトンネルを開始
 */
async function startNgrokTunnel(
  siteId: string,
  info: TunnelInfo
): Promise<ChildProcess> {
  const proc = spawn("ngrok", ["http", info.localUrl, "--log", "stdout"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // URLを取得（stdoutに出力される）
  proc.stdout?.on("data", (data: Buffer) => {
    const output = data.toString();
    // ngrokのURL形式: https://xxxx-xx-xx-xx-xx.ngrok-free.app または https://xxxx.ngrok.io
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|io)/i);
    if (urlMatch && !info.publicUrl) {
      info.publicUrl = urlMatch[0];
      info.status = "connected";
      info.provider = "ngrok";
      tunnelEvents.emit("connected", siteId, info);
    }
  });

  // stderrも確認
  proc.stderr?.on("data", (data: Buffer) => {
    const output = data.toString();
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|io)/i);
    if (urlMatch && !info.publicUrl) {
      info.publicUrl = urlMatch[0];
      info.status = "connected";
      info.provider = "ngrok";
      tunnelEvents.emit("connected", siteId, info);
    }
  });

  return proc;
}

/**
 * トンネルを開始
 * @param localUrl 接続先URL（例: http://localhost:8080, https://mysite.test）
 */
export async function startTunnel(
  siteId: string,
  siteName: string,
  localUrl: string,
  preferredProvider?: TunnelProvider
): Promise<TunnelInfo> {
  // 既存のトンネルがあれば停止
  if (activeTunnels.has(siteId)) {
    await stopTunnel(siteId);
  }

  // URLからポート番号を抽出（表示用）
  const urlObj = new URL(localUrl);
  const localPort = urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === "https:" ? 443 : 80);

  const info: TunnelInfo = {
    siteId,
    siteName,
    localPort,
    localUrl,
    status: "connecting",
  };

  // プロバイダーを決定
  let provider: TunnelProvider | null = null;

  if (preferredProvider) {
    // 優先プロバイダーが指定されている場合
    if (preferredProvider === "cloudflared" && await checkCloudflared()) {
      provider = "cloudflared";
    } else if (preferredProvider === "ngrok" && await checkNgrok()) {
      provider = "ngrok";
    }
  }

  // 優先プロバイダーが使えない場合、利用可能なものを使う
  if (!provider) {
    if (await checkCloudflared()) {
      provider = "cloudflared";
    } else if (await checkNgrok()) {
      provider = "ngrok";
    }
  }

  if (!provider) {
    info.status = "error";
    info.error = "トンネルツールがインストールされていません。cloudflared または ngrok をインストールしてください。";
    return info;
  }

  // トンネルを起動
  let proc: ChildProcess;
  if (provider === "cloudflared") {
    proc = await startCloudflaredTunnel(siteId, info);
  } else {
    proc = await startNgrokTunnel(siteId, info);
  }

  activeTunnels.set(siteId, { process: proc, info });

  proc.on("close", (code) => {
    const tunnel = activeTunnels.get(siteId);
    if (tunnel) {
      tunnel.info.status = "disconnected";
      if (code !== 0 && code !== null) {
        tunnel.info.status = "error";
        tunnel.info.error = `Process exited with code ${code}`;
      }
      tunnelEvents.emit("disconnected", siteId, tunnel.info);
    }
    activeTunnels.delete(siteId);
  });

  proc.on("error", (err) => {
    info.status = "error";
    info.error = err.message;
    activeTunnels.delete(siteId);
    tunnelEvents.emit("error", siteId, info);
  });

  // URLが取得されるまで少し待つ
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 15000);
    const checkInterval = setInterval(() => {
      if (info.publicUrl) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
  });

  return info;
}

/**
 * トンネルを停止
 */
export async function stopTunnel(siteId: string): Promise<void> {
  const tunnel = activeTunnels.get(siteId);
  if (tunnel) {
    tunnel.process.kill();
    activeTunnels.delete(siteId);
  }
}

/**
 * トンネルの状態を取得
 */
export function getTunnel(siteId: string): TunnelInfo | undefined {
  return activeTunnels.get(siteId)?.info;
}

/**
 * 全てのアクティブなトンネルを取得
 */
export function getAllTunnels(): TunnelInfo[] {
  return Array.from(activeTunnels.values()).map((t) => t.info);
}

/**
 * 全てのトンネルを停止
 */
export async function stopAllTunnels(): Promise<void> {
  for (const siteId of activeTunnels.keys()) {
    await stopTunnel(siteId);
  }
}
