# Step 9：トンネル・セキュリティスキャン

[← ハンズオン目次](README.md)

**ゴール**：ローカルサイトを一時的にインターネットに公開する**トンネル機能**（cloudflared / ngrok）と、WordPress のバージョン・脆弱性を確認する**セキュリティスキャン機能**を実装する。

---

## 9-1. トンネル機能の概要

**何をするか**
ローカルで動いているサイト（例: localhost:8080）を、**cloudflared** や **ngrok** で一時的にインターネットに公開する。スマートフォンや外部端末からローカルサイトにアクセスしたいときに使う。

**仕組み**
1. サイトカードから「トンネル開始」をクリック
2. cloudflared または ngrok の子プロセスを起動
3. 標準エラー出力から公開 URL を取得
4. 公開 URL を表示し、QR コードでスマホから読み取れるようにする
5. 「トンネル停止」で子プロセスを kill

---

## 9-2. トンネルライブラリ（lib/tunnel.ts）

**何をするか**
トンネルの開始・停止・状態取得を `src/lib/tunnel.ts` にまとめる。

**手順**

`src/lib/tunnel.ts` を新規作成する。

```typescript
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

  // URLからポート番号を抽出
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
    if (preferredProvider === "cloudflared" && await checkCloudflared()) {
      provider = "cloudflared";
    } else if (preferredProvider === "ngrok" && await checkNgrok()) {
      provider = "ngrok";
    }
  }

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

  // URLが取得されるまで待つ（最大15秒）
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
```

**ポイント**

| 関数 | 役割 |
|------|------|
| `checkCloudflared()` / `checkNgrok()` | コマンドがインストールされているか確認 |
| `getAvailableProviders()` | 利用可能なプロバイダー一覧を返す |
| `startTunnel()` | トンネルを開始し、公開 URL を取得 |
| `stopTunnel()` | トンネルを停止 |
| `getTunnel()` | トンネルの状態を取得 |

**cloudflared と HTTPS サイト**

カスタムホスト名モード（Caddy + mkcert）で HTTPS を使っているサイトをトンネルする場合、cloudflared は自己署名証明書を拒否する。これを避けるため、`startCloudflaredTunnel()` は `localUrl` が `https://` で始まるときに自動で `--no-tls-verify` フラグを追加する。

```typescript
const args = ["tunnel", "--url", info.localUrl];
if (info.localUrl.startsWith("https://")) {
  args.push("--no-tls-verify");
}
```

**確認**
- `npm run build` が通る。

---

## 9-3b. トンネル開始時の wp-config.php 動的 URL 注入

**何をするか**
トンネル経由でアクセスすると、URL が `https://xxxx.trycloudflare.com` などに変わる。しかし WordPress の `WP_HOME` / `WP_SITEURL` は固定のローカル URL（例: `http://localhost:8080`）になっているため、管理画面へのリダイレクトや静的ファイルの URL がずれる。

これを解決するため、トンネル開始 API（`POST /api/sites/[id]/tunnel`）は `ensureDynamicUrlConfig()` を呼び、`wp-config.php` に動的 URL 設定コードを注入する。

**注入するコード（概念）**

```php
// wp-config.php に追記されるブロック（WP_TETHER_DYNAMIC_URL）
$_forwarded_host = isset($_SERVER['HTTP_X_FORWARDED_HOST'])
    ? $_SERVER['HTTP_X_FORWARDED_HOST']
    : null;
if ($_forwarded_host) {
    define('WP_HOME', 'https://' . $_forwarded_host);
    define('WP_SITEURL', 'https://' . $_forwarded_host);
}
```

- cloudflared は `X-Forwarded-Host` にトンネルのホスト名を設定するため、このコードが動的に `WP_HOME` / `WP_SITEURL` を上書きする
- ローカルから直接アクセスするときは `HTTP_X_FORWARDED_HOST` がないため、通常の `WORDPRESS_CONFIG_EXTRA` で設定されたローカル URL が使われる
- トンネルを停止しても wp-config.php のコードは残るが、トンネルなしの通常アクセスには影響しない

---

## 9-3. トンネル API

**何をするか**
- **GET /api/sites/[id]/tunnel** … トンネルの状態と利用可能なプロバイダーを取得
- **POST /api/sites/[id]/tunnel** … トンネルを開始
- **DELETE /api/sites/[id]/tunnel** … トンネルを停止

**手順**

`src/app/api/sites/[id]/tunnel/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSite } from "@/lib/sites";
import {
  getTunnel,
  startTunnel,
  stopTunnel,
  getAvailableProviders,
  TunnelProvider,
} from "@/lib/tunnel";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tunnel = getTunnel(id);
    const availableProviders = await getAvailableProviders();

    return NextResponse.json({
      tunnel: tunnel || null,
      availableProviders,
    });
  } catch (error) {
    console.error("Failed to get tunnel status:", error);
    return NextResponse.json(
      { error: "トンネル状態の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // リクエストからプロバイダーを取得（オプション）
    let preferredProvider: TunnelProvider | undefined;
    try {
      const body = await request.json();
      preferredProvider = body.provider;
    } catch {
      // bodyが無い場合は無視
    }

    // ローカルURLを組み立て
    let localUrl: string;
    if (site.config.hostnameMode === "localhost") {
      localUrl = `http://localhost:${site.config.port}`;
    } else {
      localUrl = `https://${site.config.hostname}`;
    }

    const tunnel = await startTunnel(id, site.name, localUrl, preferredProvider);
    const availableProviders = await getAvailableProviders();

    return NextResponse.json({
      tunnel,
      availableProviders,
    });
  } catch (error) {
    console.error("Failed to start tunnel:", error);
    return NextResponse.json(
      { error: "トンネルの開始に失敗しました" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await stopTunnel(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to stop tunnel:", error);
    return NextResponse.json(
      { error: "トンネルの停止に失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**
- cloudflared または ngrok をインストールしたうえで、POST /api/sites/[id]/tunnel を呼ぶと公開 URL が返る。

---

## 9-4. トンネルダイアログコンポーネント

**何をするか**
サイトカードから呼び出せるトンネルダイアログを実装する。公開 URL と QR コードを表示する。

**手順**

`src/components/site-card/tunnel-dialog.tsx` を新規作成する。

```typescript
"use client";

import { useState, useEffect } from "react";
import { Globe, QrCode, Copy, Check, Loader2 } from "lucide-react";

interface TunnelInfo {
  siteId: string;
  siteName: string;
  localPort: number;
  localUrl: string;
  publicUrl?: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
  provider?: string;
}

interface TunnelDialogProps {
  siteId: string;
  siteName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TunnelDialog({ siteId, siteName, isOpen, onClose }: TunnelDialogProps) {
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTunnelStatus();
    }
  }, [isOpen, siteId]);

  async function fetchTunnelStatus() {
    try {
      const res = await fetch(`/api/sites/${siteId}/tunnel`);
      const data = await res.json();
      setTunnel(data.tunnel);
      setAvailableProviders(data.availableProviders || []);
    } catch {
      setError("状態の取得に失敗しました");
    }
  }

  async function handleStart(provider?: string) {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${siteId}/tunnel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTunnel(data.tunnel);
        setAvailableProviders(data.availableProviders || []);
      }
    } catch {
      setError("トンネルの開始に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStop() {
    setIsLoading(true);
    setError(null);

    try {
      await fetch(`/api/sites/${siteId}/tunnel`, { method: "DELETE" });
      setTunnel(null);
    } catch {
      setError("トンネルの停止に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    if (tunnel?.publicUrl) {
      await navigator.clipboard.writeText(tunnel.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5" />
          <h3 className="font-semibold text-lg">トンネル</h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          <strong>{siteName}</strong> を一時的にインターネットに公開します
        </p>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {availableProviders.length === 0 && !tunnel && (
          <div className="mb-4 p-3 rounded bg-yellow-50 text-yellow-700 text-sm">
            トンネルツールがインストールされていません。
            <br />
            <code>cloudflared</code> または <code>ngrok</code> をインストールしてください。
          </div>
        )}

        {tunnel?.status === "connected" && tunnel.publicUrl ? (
          <div className="space-y-4">
            {/* 公開URL */}
            <div className="p-3 rounded bg-green-50 border border-green-200">
              <div className="text-xs text-green-600 mb-1">公開URL（{tunnel.provider}）</div>
              <div className="flex items-center gap-2">
                <a
                  href={tunnel.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-mono text-sm break-all"
                >
                  {tunnel.publicUrl}
                </a>
                <button onClick={handleCopy} className="shrink-0">
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            {/* QRコード */}
            <div className="flex justify-center">
              <div className="p-2 bg-white rounded border">
                <img
                  src={`/api/qrcode?url=${encodeURIComponent(tunnel.publicUrl)}`}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>

            {/* 停止ボタン */}
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="w-full rounded bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? "停止中..." : "トンネルを停止"}
            </button>
          </div>
        ) : tunnel?.status === "connecting" ? (
          <div className="flex items-center gap-2 justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>接続中...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {availableProviders.map((provider) => (
              <button
                key={provider}
                onClick={() => handleStart(provider)}
                disabled={isLoading}
                className="w-full rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? "開始中..." : `${provider} で開始`}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
```

**確認**
- サイトカードに「トンネル」ボタンを追加し、クリックでダイアログを表示する。

---

## 9-5. セキュリティスキャンの概要

**何をするか**
登録したローカルサイトについて、以下をチェックする：

1. **バージョン確認**：WordPress コア、PHP、プラグイン、テーマのバージョンを取得
2. **ファイルスキャン**：PHP / JavaScript の不審なパターン（`eval`、`base64_decode` など）を検出
3. **npm audit**：プラグイン/テーマに package.json がある場合、脆弱性をチェック
4. **WPVulnerability API**：既知の脆弱性データベースと照合

---

## 9-6. セキュリティスキャン型の定義

**何をするか**
セキュリティスキャンに必要な型を `src/types/index.ts` に追加する。

**手順**

`src/types/index.ts` に以下を追加する。

```typescript
// ===========================================
// セキュリティスキャン
// ===========================================

export interface SecurityVersionInfo {
  wordpress?: string;
  php?: string;
  plugins: { name: string; version: string; status: "active" | "inactive" }[];
  themes: { name: string; version: string; status: "active" | "inactive" }[];
}

export interface SecurityFileScanIssue {
  path: string;
  line?: number;
  pattern: string;
  snippet?: string;
}

export interface SecurityFileScanResult {
  scannedDirs: string[];
  filesScanned: number;
  issues: SecurityFileScanIssue[];
}

export interface SecurityRecommendation {
  id: string;
  level: "warning" | "info";
  title: string;
  message: string;
  detail?: string[];
}

export interface SecurityVulnerabilityItem {
  name: string;
  description?: string;
  link?: string;
  severity?: string;
  affectedVersion?: string;
}

export interface SecurityVulnerabilityCheck {
  type: "core" | "plugin" | "theme";
  name: string;
  slug?: string;
  installedVersion: string;
  vulnerabilities: SecurityVulnerabilityItem[];
}

export interface SecurityNpmAuditResult {
  projectPath: string;
  error?: string;
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
  };
}

export interface SecurityScanResult {
  scannedAt: string;
  version: SecurityVersionInfo;
  fileScan: SecurityFileScanResult;
  recommendations: SecurityRecommendation[];
  versionSkippedReason?: string;
  vulnerabilityChecks: SecurityVulnerabilityCheck[];
  npmAudit?: SecurityNpmAuditResult[];
}
```

---

## 9-7. セキュリティスキャン API

**何をするか**
**GET /api/sites/[id]/security/scan** でセキュリティスキャンを実行し、結果を返す。

**手順**

```bash
mkdir -p src/app/api/sites/[id]/security/scan
```

`src/app/api/sites/[id]/security/scan/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";
import {
  SecurityScanResult,
  SecurityVersionInfo,
  SecurityFileScanResult,
  SecurityFileScanIssue,
  SecurityRecommendation,
} from "@/types";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 不審なパターン
const SUSPICIOUS_PATTERNS = {
  php: [
    { pattern: /\beval\s*\(/gi, name: "eval()" },
    { pattern: /\bbase64_decode\s*\(/gi, name: "base64_decode()" },
    { pattern: /\bgzinflate\s*\(/gi, name: "gzinflate()" },
    { pattern: /\bpreg_replace\s*\([^)]*\/e/gi, name: "preg_replace /e modifier" },
    { pattern: /\bexec\s*\(/gi, name: "exec()" },
    { pattern: /\bshell_exec\s*\(/gi, name: "shell_exec()" },
    { pattern: /\bsystem\s*\(/gi, name: "system()" },
    { pattern: /\bpassthru\s*\(/gi, name: "passthru()" },
  ],
  js: [
    { pattern: /\beval\s*\(/gi, name: "eval()" },
    { pattern: /\bdocument\.write\s*\(/gi, name: "document.write()" },
    { pattern: /\.innerHTML\s*=/gi, name: "innerHTML assignment" },
  ],
};

async function getVersionInfo(sitePath: string, projectName: string, isRunning: boolean): Promise<{ version: SecurityVersionInfo; skippedReason?: string }> {
  const version: SecurityVersionInfo = {
    plugins: [],
    themes: [],
  };

  if (!isRunning) {
    return { version, skippedReason: "サイトが起動していないため、バージョン情報を取得できませんでした" };
  }

  try {
    // WordPress バージョン
    const { stdout: wpVersion } = await execAsync(
      `docker compose -p ${projectName} run --rm wpcli core version`,
      { cwd: sitePath, timeout: 30000 }
    );
    version.wordpress = wpVersion.trim();

    // PHP バージョン
    const { stdout: phpVersion } = await execAsync(
      `docker compose -p ${projectName} run --rm wpcli eval "echo PHP_VERSION;"`,
      { cwd: sitePath, timeout: 30000 }
    );
    version.php = phpVersion.trim();

    // プラグイン一覧
    const { stdout: pluginJson } = await execAsync(
      `docker compose -p ${projectName} run --rm wpcli plugin list --format=json`,
      { cwd: sitePath, timeout: 30000 }
    );
    const plugins = JSON.parse(pluginJson);
    version.plugins = plugins.map((p: { name: string; version: string; status: string }) => ({
      name: p.name,
      version: p.version,
      status: p.status === "active" ? "active" : "inactive",
    }));

    // テーマ一覧
    const { stdout: themeJson } = await execAsync(
      `docker compose -p ${projectName} run --rm wpcli theme list --format=json`,
      { cwd: sitePath, timeout: 30000 }
    );
    const themes = JSON.parse(themeJson);
    version.themes = themes.map((t: { name: string; version: string; status: string }) => ({
      name: t.name,
      version: t.version,
      status: t.status === "active" ? "active" : "inactive",
    }));
  } catch (error) {
    console.error("Failed to get version info:", error);
  }

  return { version };
}

async function scanFiles(wpContentPath: string): Promise<SecurityFileScanResult> {
  const result: SecurityFileScanResult = {
    scannedDirs: [],
    filesScanned: 0,
    issues: [],
  };

  const dirsToScan = ["plugins", "themes"];

  for (const dir of dirsToScan) {
    const dirPath = path.join(wpContentPath, dir);
    try {
      await fs.access(dirPath);
      result.scannedDirs.push(dir);
      await scanDirectory(dirPath, dir, result);
    } catch {
      // ディレクトリがない場合はスキップ
    }
  }

  return result;
}

async function scanDirectory(dirPath: string, relativePath: string, result: SecurityFileScanResult): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      // node_modules, vendor などはスキップ
      if (!["node_modules", "vendor", ".git"].includes(entry.name)) {
        await scanDirectory(fullPath, relPath, result);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".php" || ext === ".js") {
        result.filesScanned++;
        await scanFile(fullPath, relPath, ext, result);
      }
    }
  }
}

async function scanFile(fullPath: string, relativePath: string, ext: string, result: SecurityFileScanResult): Promise<void> {
  try {
    const content = await fs.readFile(fullPath, "utf-8");
    const lines = content.split("\n");
    const patterns = ext === ".php" ? SUSPICIOUS_PATTERNS.php : SUSPICIOUS_PATTERNS.js;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, name } of patterns) {
        if (pattern.test(line)) {
          result.issues.push({
            path: relativePath,
            line: i + 1,
            pattern: name,
            snippet: line.trim().slice(0, 100),
          });
        }
      }
    }
  } catch {
    // ファイル読み込みエラーは無視
  }
}

function generateRecommendations(version: SecurityVersionInfo, fileScan: SecurityFileScanResult): SecurityRecommendation[] {
  const recommendations: SecurityRecommendation[] = [];

  // 無効化プラグインの削除推奨
  const inactivePlugins = version.plugins.filter((p) => p.status === "inactive");
  if (inactivePlugins.length > 0) {
    recommendations.push({
      id: "inactive-plugins",
      level: "warning",
      title: "未使用のプラグインを削除してください",
      message: "無効化されたプラグインが残っています。セキュリティリスクを減らすため、使用しないプラグインは削除することを推奨します。",
      detail: inactivePlugins.map((p) => p.name),
    });
  }

  // 不審なパターンが検出された場合
  if (fileScan.issues.length > 0) {
    recommendations.push({
      id: "suspicious-patterns",
      level: "warning",
      title: "不審なコードパターンが検出されました",
      message: `${fileScan.issues.length} 件の不審なパターンが見つかりました。マルウェアや意図しないコードの可能性があります。`,
    });
  }

  return recommendations;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    const isRunning = site.status === "running";
    const wpContentPath = path.join(site.path, "src", "wp-content");

    // バージョン情報を取得
    const { version, skippedReason } = await getVersionInfo(
      site.path,
      site.config.projectName,
      isRunning
    );

    // ファイルスキャン
    const fileScan = await scanFiles(wpContentPath);

    // 推奨事項を生成
    const recommendations = generateRecommendations(version, fileScan);

    const result: SecurityScanResult = {
      scannedAt: new Date().toISOString(),
      version,
      fileScan,
      recommendations,
      versionSkippedReason: skippedReason,
      vulnerabilityChecks: [], // WPVulnerability API 連携は別途実装
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Security scan failed:", error);
    return NextResponse.json(
      { error: "セキュリティスキャンに失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**
- サイトを起動した状態で `GET /api/sites/[id]/security/scan` を呼ぶと、スキャン結果が返る。

---

## 9-8. セキュリティスキャンダイアログ

**何をするか**
サイトカードから呼び出せるセキュリティスキャンダイアログを実装する。

**手順**

`src/components/site-card/security-scan-dialog.tsx` を新規作成する。

```typescript
"use client";

import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { SecurityScanResult } from "@/types";

interface SecurityScanDialogProps {
  siteId: string;
  siteName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SecurityScanDialog({ siteId, siteName, isOpen, onClose }: SecurityScanDialogProps) {
  const [result, setResult] = useState<SecurityScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${siteId}/security/scan`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("スキャンに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5" />
          <h3 className="font-semibold text-lg">セキュリティスキャン</h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          <strong>{siteName}</strong> のセキュリティ状態をチェックします
        </p>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!result && !isLoading && (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">
              「スキャン実行」をクリックすると、以下をチェックします：
            </p>
            <ul className="text-sm text-gray-500 mb-6">
              <li>✓ WordPress / PHP / プラグイン / テーマのバージョン</li>
              <li>✓ 不審なコードパターン（eval, base64_decode など）</li>
              <li>✓ セキュリティに関する推奨事項</li>
            </ul>
            <button
              onClick={handleScan}
              className="rounded bg-blue-600 text-white px-6 py-2 hover:bg-blue-700"
            >
              スキャン実行
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>スキャン中...</span>
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-auto space-y-4">
            {/* バージョン情報 */}
            <div className="border rounded p-4">
              <h4 className="font-medium mb-2">バージョン情報</h4>
              {result.versionSkippedReason ? (
                <p className="text-sm text-yellow-600">{result.versionSkippedReason}</p>
              ) : (
                <div className="text-sm space-y-1">
                  <p>WordPress: {result.version.wordpress || "不明"}</p>
                  <p>PHP: {result.version.php || "不明"}</p>
                  <p>プラグイン: {result.version.plugins.length} 個</p>
                  <p>テーマ: {result.version.themes.length} 個</p>
                </div>
              )}
            </div>

            {/* ファイルスキャン結果 */}
            <div className="border rounded p-4">
              <h4 className="font-medium mb-2">ファイルスキャン</h4>
              <p className="text-sm text-gray-600 mb-2">
                {result.fileScan.filesScanned} ファイルをスキャン
              </p>
              {result.fileScan.issues.length > 0 ? (
                <div className="space-y-2">
                  {result.fileScan.issues.slice(0, 10).map((issue, i) => (
                    <div key={i} className="text-sm bg-yellow-50 p-2 rounded">
                      <div className="flex items-center gap-1 text-yellow-700">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{issue.pattern}</span>
                      </div>
                      <p className="text-gray-600 mt-1">
                        {issue.path}:{issue.line}
                      </p>
                    </div>
                  ))}
                  {result.fileScan.issues.length > 10 && (
                    <p className="text-sm text-gray-500">
                      他 {result.fileScan.issues.length - 10} 件...
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>問題は検出されませんでした</span>
                </div>
              )}
            </div>

            {/* 推奨事項 */}
            {result.recommendations.length > 0 && (
              <div className="border rounded p-4">
                <h4 className="font-medium mb-2">推奨事項</h4>
                <div className="space-y-2">
                  {result.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className={`text-sm p-2 rounded ${
                        rec.level === "warning" ? "bg-yellow-50" : "bg-blue-50"
                      }`}
                    >
                      <p className="font-medium">{rec.title}</p>
                      <p className="text-gray-600 mt-1">{rec.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 再スキャンボタン */}
            <button
              onClick={handleScan}
              disabled={isLoading}
              className="w-full rounded border border-blue-600 text-blue-600 px-4 py-2 hover:bg-blue-50 disabled:opacity-50"
            >
              再スキャン
            </button>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
```

**確認**
- サイトカードに「セキュリティ」ボタンを追加し、クリックでダイアログを表示する。

---

---

## 9-8b. セキュリティスキャンのキャッシュと再スキャン

**何をするか**
セキュリティスキャンはファイルスキャンや WP-CLI 実行を含むため時間がかかる。本プロジェクトの実装では、スキャン結果を `data/security-scan-cache.json` にキャッシュし、次回以降はキャッシュを返すことで高速化している。強制再スキャンには `?refresh=1` クエリパラメータを使う。

**API の動作**

```
GET /api/sites/[id]/security/scan          # キャッシュがあれば返す（なければスキャン実行）
GET /api/sites/[id]/security/scan?refresh=1  # キャッシュを無視して強制再スキャン
```

**キャッシュの実装（概念）**

```typescript
// lib/security-cache.ts
const CACHE_FILE = path.join(process.cwd(), "data", "security-scan-cache.json");

export async function getCachedScan(siteId: string): Promise<SecurityScanResult | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, "utf-8");
    const cache = JSON.parse(content);
    return cache[siteId] ?? null;
  } catch {
    return null;
  }
}

export async function setCachedScan(siteId: string, result: SecurityScanResult): Promise<void> {
  let cache: Record<string, SecurityScanResult> = {};
  try {
    const content = await fs.readFile(CACHE_FILE, "utf-8");
    cache = JSON.parse(content);
  } catch { /* ファイルがない場合は空 */ }
  cache[siteId] = result;
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}
```

**GET ハンドラへのキャッシュ組み込み**

```typescript
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  // キャッシュを確認（refresh=1 の場合はスキップ）
  if (!refresh) {
    const cached = await getCachedScan(id);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  // スキャン実行
  const result = await runSecurityScan(site);

  // キャッシュに保存
  await setCachedScan(id, result);

  return NextResponse.json(result);
}
```

**フロントエンドでの使い方**

ダイアログの「再スキャン」ボタンは `?refresh=1` を付けて fetch する。

```typescript
// 初回: キャッシュを使う
fetch(`/api/sites/${siteId}/security/scan`);

// 再スキャン: 強制実行
fetch(`/api/sites/${siteId}/security/scan?refresh=1`);
```

**確認**
- 1 回スキャンを実行すると、`data/security-scan-cache.json` にサイト ID をキーとした結果が保存される。
- 同じ URL を `?refresh=1` なしで再度呼ぶと、スキャンをスキップしてキャッシュが返る（レスポンスが速い）。

---

## Step 9 のまとめと確認

- [ ] `lib/tunnel.ts` に `startTunnel`, `stopTunnel`, `getTunnel`, `getAvailableProviders` がある
- [ ] GET/POST/DELETE /api/sites/[id]/tunnel でトンネルの状態取得・開始・停止ができる
- [ ] トンネルダイアログで公開 URL と QR コードが表示される
- [ ] HTTPS サイト（Caddy + mkcert）のトンネル時、cloudflared に `--no-tls-verify` が自動付与される
- [ ] トンネル開始時に `ensureDynamicUrlConfig()` が wp-config.php に動的 URL コードを注入する
- [ ] セキュリティスキャン用の型が定義されている
- [ ] GET /api/sites/[id]/security/scan でバージョン情報・ファイルスキャン・推奨事項が返る
- [ ] `?refresh=1` で強制再スキャン、なしでキャッシュ返却ができる
- [ ] セキュリティスキャンダイアログでスキャン結果が表示される

**ここまでで Step 9、およびハンズオン全体が完了です。**

---

## 次のステップ（発展）

ハンズオン Step 1〜9 で、wp-tether の主要な機能を一通り実装しました。さらに発展させる場合は以下を参考にしてください：

- **WPVulnerability API 連携**：本プロジェクトの `src/lib/wpvulnerability.ts` を参照
- **HTTP セキュリティヘッダチェック**：本プロジェクトの `src/lib/security-scan.ts` を参照
- **npm audit 連携**：プラグイン/テーマの package.json を検出して `npm audit` を実行
- **カスタムホスト名 + SSL**：Caddy + mkcert によるリバースプロキシ
- **Mailpit**：開発用メールサーバーの追加

本プロジェクトの `src/` を参照しながら、必要な機能を追加してください。
