# Step 7：コンテナ管理・QR コード・エクスポート

[← ハンズオン目次](README.md)

**ゴール**：**コンテナ一覧**（全サイトの Docker コンテナを一覧表示し、ログ表示・再起動ができる）、**QR コード API**（URL を SVG で返す）、**設定のエクスポート**（サイト・デプロイターゲットを JSON でダウンロード）を実装する。

---

## 7-1. コンテナ一覧 API

**何をするか**
全サイトについて、各サイトの `site.path` で `docker compose ps --format json -a` を実行し、コンテナ情報を集めて **GET /api/containers** で返す。

**手順**

`src/app/api/containers/route.ts` を新規作成する。

```typescript
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSites } from "@/lib/sites";

const execFileAsync = promisify(execFile);

export interface ContainerInfo {
  id: string;
  name: string;
  service: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  siteId: string;
  siteName: string;
}

async function getSiteContainers(
  siteId: string,
  siteName: string,
  sitePath: string
): Promise<ContainerInfo[]> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "ps", "--format", "json", "-a"],
      { cwd: sitePath, timeout: 10000 }
    );

    if (!stdout.trim()) return [];

    const containers: ContainerInfo[] = [];
    const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      try {
        const c = JSON.parse(line);
        containers.push({
          id: c.ID || "",
          name: c.Name || "",
          service: c.Service || "",
          image: c.Image || "",
          state: (c.State || "unknown").toLowerCase(),
          status: c.Status || "",
          ports: c.Ports || "",
          siteId,
          siteName,
        });
      } catch {
        // パースエラーは無視
      }
    }
    return containers;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const sites = await getSites();
    const containersBySite = await Promise.all(
      sites.map((site) => getSiteContainers(site.id, site.name, site.path))
    );
    const containers = containersBySite.flat();
    return NextResponse.json({ containers });
  } catch (error) {
    console.error("Failed to get containers:", error);
    return NextResponse.json(
      { error: "Failed to get containers" },
      { status: 500 }
    );
  }
}
```

**確認**
- サイトを起動した状態で `GET /api/containers` を呼ぶと、コンテナ一覧が返る。

---

## 7-2. コンテナログ取得・再起動 API

**何をするか**
- **GET /api/containers/[id]/logs** … 指定したコンテナ ID の `docker logs` を取得。
- **POST /api/containers/[id]/restart** … 指定したコンテナを `docker restart` する。

**手順**

```bash
mkdir -p src/app/api/containers/[id]/logs
mkdir -p src/app/api/containers/[id]/restart
```

**1. ログ取得 API**

`src/app/api/containers/[id]/logs/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tail = searchParams.get("tail") || "100";

    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["logs", "--tail", tail, "--timestamps", id],
      { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
    );

    const logs = stdout + stderr;
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Failed to get container logs:", error);
    return NextResponse.json(
      { error: "Failed to get container logs" },
      { status: 500 }
    );
  }
}
```

**2. 再起動 API**

`src/app/api/containers/[id]/restart/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await execFileAsync("docker", ["restart", id], { timeout: 60000 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to restart container:", error);
    return NextResponse.json(
      { error: "Failed to restart container" },
      { status: 500 }
    );
  }
}
```

**確認**
- `GET /api/containers/[id]/logs?tail=50` でログが返る。
- `POST /api/containers/[id]/restart` でコンテナが再起動する。

---

## 7-3. コンテナ一覧ページ

**何をするか**
**/containers** で、GET /api/containers の結果を表形式で表示する。各コンテナに「ログ」「再起動」ボタンを付ける。

**手順**

`src/app/containers/page.tsx` を新規作成する（クライアントコンポーネント）。

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, FileText, RotateCcw } from "lucide-react";

interface ContainerInfo {
  id: string;
  name: string;
  service: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  siteId: string;
  siteName: string;
}

export default function ContainersPage() {
  const router = useRouter();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<{ id: string; name: string; logs: string } | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [restartingId, setRestartingId] = useState<string | null>(null);

  async function fetchContainers() {
    setLoading(true);
    try {
      const res = await fetch("/api/containers");
      const data = await res.json();
      setContainers(data.containers || []);
      setError(null);
    } catch {
      setError("コンテナ一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContainers();
  }, []);

  async function handleShowLogs(container: ContainerInfo) {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/containers/${container.id}/logs?tail=200`);
      const data = await res.json();
      setSelectedLogs({
        id: container.id,
        name: container.name,
        logs: data.logs || "ログがありません",
      });
    } catch {
      setSelectedLogs({
        id: container.id,
        name: container.name,
        logs: "ログの取得に失敗しました",
      });
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleRestart(container: ContainerInfo) {
    if (!confirm(`${container.name} を再起動しますか？`)) return;

    setRestartingId(container.id);
    try {
      const res = await fetch(`/api/containers/${container.id}/restart`, { method: "POST" });
      if (!res.ok) throw new Error("再起動に失敗しました");
      await fetchContainers();
    } catch {
      alert("再起動に失敗しました");
    } finally {
      setRestartingId(null);
    }
  }

  // サイトごとにグループ化
  const containersBySite = containers.reduce((acc, c) => {
    if (!acc[c.siteName]) acc[c.siteName] = [];
    acc[c.siteName].push(c);
    return acc;
  }, {} as Record<string, ContainerInfo[]>);

  const stateColor = (state: string) => {
    switch (state) {
      case "running": return "bg-green-100 text-green-800";
      case "exited": return "bg-gray-100 text-gray-600";
      case "paused": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">コンテナ</h1>
          <p className="text-gray-500">全サイトのDockerコンテナ</p>
        </div>
        <button
          onClick={fetchContainers}
          disabled={loading}
          className="flex items-center gap-2 rounded border border-gray-300 px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">読み込み中...</div>
      ) : containers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          コンテナがありません。サイトを起動してください。
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(containersBySite).map(([siteName, siteContainers]) => (
            <div key={siteName}>
              <h2 className="text-lg font-semibold mb-3">{siteName}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">サービス</th>
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">コンテナ</th>
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">イメージ</th>
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">状態</th>
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">ポート</th>
                      <th className="border border-gray-200 px-4 py-2 text-left text-sm font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteContainers.map((container) => (
                      <tr key={container.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-2 text-sm">{container.service}</td>
                        <td className="border border-gray-200 px-4 py-2 text-sm font-mono text-xs">{container.name}</td>
                        <td className="border border-gray-200 px-4 py-2 text-sm font-mono text-xs">{container.image}</td>
                        <td className="border border-gray-200 px-4 py-2">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${stateColor(container.state)}`}>
                            {container.state}
                          </span>
                        </td>
                        <td className="border border-gray-200 px-4 py-2 text-sm font-mono text-xs">{container.ports || "-"}</td>
                        <td className="border border-gray-200 px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleShowLogs(container)}
                              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                            >
                              <FileText className="w-3 h-3" />
                              ログ
                            </button>
                            <button
                              onClick={() => handleRestart(container)}
                              disabled={restartingId === container.id}
                              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              <RotateCcw className={`w-3 h-3 ${restartingId === container.id ? "animate-spin" : ""}`} />
                              再起動
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ログ表示モーダル */}
      {selectedLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">{selectedLogs.name} のログ</h3>
              <button
                onClick={() => setSelectedLogs(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-900 text-gray-100 rounded p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {logsLoading ? "読み込み中..." : selectedLogs.logs}
              </pre>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedLogs(null)}
                className="rounded border border-gray-300 px-4 py-2"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**サイドバーにリンクを追加**

`src/components/app-sidebar.tsx` に、コンテナへのリンクを追加する。

```tsx
<Link href="/containers">
  <Box className="w-4 h-4" />
  <span>コンテナ</span>
</Link>
```

**確認**
- `/containers` で全サイトのコンテナが表示され、ログ表示・再起動ができる。

---

## 7-4. QR コード API

**何をするか**
**GET /api/qrcode?url=xxx** で、指定した URL の QR コードを **SVG** で返す。トンネルで発行した公開 URL をスマートフォンで開くときなどに使う。

**手順**

`src/app/api/qrcode/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const svg = await QRCode.toString(url, {
      type: "svg",
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
```

**確認**
- ブラウザで `GET /api/qrcode?url=https://example.com` を開くと、SVG の QR コードが表示される。
- フロントでは `<img src={\`/api/qrcode?url=${encodeURIComponent(publicUrl)}\`} alt="QR" />` のように参照できる。

---

## 7-5. 設定のエクスポート API

**何をするか**
**GET /api/export/sites** と **GET /api/export/deploy-targets** で、それぞれのデータを日付入りファイル名でダウンロードできるようにする。

**手順**

```bash
mkdir -p src/app/api/export/sites
mkdir -p src/app/api/export/deploy-targets
```

**1. サイトのエクスポート**

`src/app/api/export/sites/route.ts` を新規作成する。

```typescript
import { NextResponse } from "next/server";
import { getSites } from "@/lib/sites";

export async function GET() {
  try {
    const sites = await getSites();
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      type: "sites",
      data: sites,
    };

    const filename = `wp-tether-sites-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export sites:", error);
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
```

**2. デプロイターゲットのエクスポート**

`src/app/api/export/deploy-targets/route.ts` を新規作成する。

```typescript
import { NextResponse } from "next/server";
import { getDeployTargets } from "@/lib/deploy-targets";

export async function GET() {
  try {
    const targets = await getDeployTargets();
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      type: "deploy-targets",
      data: targets,
    };

    const filename = `wp-tether-deploy-targets-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export deploy targets:", error);
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**
- ブラウザで `/api/export/sites` にアクセスすると、JSON ファイルがダウンロードされる。
- 同様に `/api/export/deploy-targets` でデプロイターゲットがダウンロードされる。

---

## 7-6. 設定のインポート API（マージ vs 上書き）

**何をするか**
エクスポートした JSON をインポートして復元できるようにする。インポートには **マージ（merge）** と **上書き（replace）** の 2 モードがある。

**モードの違い**

| モード | 動作 | 使うタイミング |
|--------|------|--------------|
| `merge`（デフォルト） | 同じ ID があれば上書き、なければ追加 | 部分的に移行したい、追加だけしたい |
| `replace` | 既存データをすべて削除してインポートで置換 | まるごと別環境へコピーしたい |

**手順**

```bash
mkdir -p src/app/api/import/sites
mkdir -p src/app/api/import/deploy-targets
```

**1. サイトのインポート**

`src/app/api/import/sites/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSites, saveSites } from "@/lib/sites";
import { Site } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.data || !Array.isArray(body.data)) {
      return NextResponse.json(
        { error: "無効なインポートデータです" },
        { status: 400 }
      );
    }

    const importedSites: Site[] = body.data;
    const mode: "merge" | "replace" = body.mode === "replace" ? "replace" : "merge";

    let added = 0;
    let updated = 0;

    if (mode === "replace") {
      // 上書きモード：既存データを完全に置換
      await saveSites(importedSites);
      added = importedSites.length;
    } else {
      // マージモード：同じIDがあれば上書き、なければ追加
      const existingSites = await getSites();
      const existingMap = new Map(existingSites.map((s) => [s.id, s]));
      for (const site of importedSites) {
        if (existingMap.has(site.id)) {
          existingMap.set(site.id, site);
          updated++;
        } else {
          existingMap.set(site.id, site);
          added++;
        }
      }
      await saveSites(Array.from(existingMap.values()));
    }

    return NextResponse.json({
      success: true,
      message: `インポート完了: ${added}件追加, ${updated}件更新`,
      stats: { added, updated, total: importedSites.length },
    });
  } catch (error) {
    console.error("Failed to import sites:", error);
    return NextResponse.json(
      { error: "インポートに失敗しました" },
      { status: 500 }
    );
  }
}
```

**2. デプロイターゲットのインポート**

`src/app/api/import/deploy-targets/route.ts` を新規作成する。サイトと同じ merge/replace ロジックで `DeployTarget[]` を対象に実装する。

**確認**
- `POST /api/import/sites` に `{ "data": [...], "mode": "merge" }` を送ると、サイトがマージされる。
- `"mode": "replace"` にすると既存データを丸ごと置換する。

---

## 7-7. 設定ファイル再生成 API

**何をするか**
`docker-compose.yml`, `.env`, `Caddyfile` などを最新テンプレートで **再生成** する。テンプレートを変更した後や、設定が壊れた場合に使う。

**POST /api/sites/[id]/regenerate**

`src/app/api/sites/[id]/regenerate/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSite } from "@/lib/sites";
import { generateDockerComposeFile, generateEnvFile, generateCaddyfile } from "@/lib/docker";
import path from "path";
import fs from "fs/promises";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const site = await getSite(id);
    if (!site) {
      return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
    }

    const sitePath = site.path;
    const regenerated: string[] = [];

    // docker-compose.yml を再生成
    await generateDockerComposeFile(site);
    regenerated.push("docker-compose.yml");

    // .env を再生成
    await generateEnvFile(site);
    regenerated.push(".env");

    // php/custom.ini を再生成
    await generatePhpIni(sitePath);
    regenerated.push("php/custom.ini");

    // カスタムホスト名モードの場合は Caddyfile も再生成
    if (site.customHostname) {
      // mkcert証明書の存在確認
      const certPath = path.join(sitePath, "certs", "cert.pem");
      let hasCert = false;
      try {
        await fs.access(certPath);
        hasCert = true;
      } catch {
        hasCert = false;
      }
      await generateCaddyfile(site, hasCert);
      regenerated.push("Caddyfile");
    }

    return NextResponse.json({
      success: true,
      message: "設定ファイルを再生成しました。コンテナを再起動すると反映されます。",
      regenerated,
    });
  } catch (error) {
    console.error("Failed to regenerate configs:", error);
    return NextResponse.json(
      { error: "設定ファイルの再生成に失敗しました" },
      { status: 500 }
    );
  }
}
```

**ポイント**

- 再生成後は **コンテナを再起動**しないと反映されない（`docker compose restart`）。
- mkcert 証明書がない場合は `tls internal`（自己署名）にフォールバックして Caddyfile を生成する。
- レスポンスの `regenerated` 配列で、実際に再生成されたファイル名を確認できる。

**確認**
- `POST /api/sites/[id]/regenerate` を呼ぶと、設定ファイルが再生成され `regenerated` に更新ファイル名が返る。

---

## 7-8. フォルダ・ターミナル起動 API

**何をするか**
サイトのディレクトリを Finder（macOS）/ エクスプローラー（Windows）で開いたり、ターミナルをそのディレクトリで起動したりする。

**POST /api/open-folder**

`src/app/api/open-folder/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const { path: folderPath } = await request.json();
    if (!folderPath || typeof folderPath !== "string") {
      return NextResponse.json({ error: "path が必要です" }, { status: 400 });
    }

    // パスの存在確認（パストラバーサル対策）
    const resolved = path.resolve(folderPath);
    await fs.access(resolved);

    const platform = process.platform;
    if (platform === "darwin") {
      await execFileAsync("open", [resolved]);
    } else if (platform === "win32") {
      await execFileAsync("explorer", [resolved]);
    } else {
      await execFileAsync("xdg-open", [resolved]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to open folder:", error);
    return NextResponse.json({ error: "フォルダを開けませんでした" }, { status: 500 });
  }
}
```

**POST /api/open-terminal**

`src/app/api/open-terminal/route.ts` を新規作成する。OS ごとに適切なターミナルアプリを起動する。

```typescript
// macOS: open -a Terminal [path]
// Linux: gnome-terminal --working-directory [path]
// Windows: explorer [path]  ← フォルダ表示のみ（cmd の直接起動は避ける）
```

**OS ごとの動作**

| OS | フォルダを開く | ターミナルを開く |
|----|--------------|----------------|
| macOS | `open [path]` | `open -a Terminal [path]` |
| Linux | `xdg-open [path]` | `gnome-terminal --working-directory [path]` |
| Windows | `explorer [path]` | `explorer [path]` |

**セキュリティ**
- `execFile` を使いシェルを経由しない（シェルインジェクション防止）。
- `path.resolve()` + `fs.access()` でパスの存在確認を必ず実行する。

**確認**
- `POST /api/open-folder` に `{ "path": "/path/to/site" }` を送ると Finder が開く（macOS）。
- `POST /api/open-terminal` で同ディレクトリのターミナルが起動する。

---

## 7-9. 孤児ターゲット自動クリーンアップ

**何をするか**
サイトを削除したとき、そのサイトに紐づく **デプロイターゲット（孤児ターゲット）** が `data/deploy-targets.json` に残ることがある。**POST /api/cleanup/orphan-targets** でまとめて削除できるようにする。

**POST /api/cleanup/orphan-targets**

`src/app/api/cleanup/orphan-targets/route.ts` を新規作成する。

```typescript
import { NextResponse } from "next/server";
import { getSites } from "@/lib/sites";
import { getDeployTargets, saveDeployTargets } from "@/lib/deploy-targets";

export async function POST() {
  try {
    const [sites, targets] = await Promise.all([getSites(), getDeployTargets()]);

    const validSiteIds = new Set(sites.map((s) => s.id));
    const validTargets = targets.filter((t) => validSiteIds.has(t.siteId));
    const orphanCount = targets.length - validTargets.length;

    if (orphanCount > 0) {
      await saveDeployTargets(validTargets);
    }

    return NextResponse.json({
      success: true,
      message: orphanCount > 0 ? `${orphanCount}件の孤児データを削除しました` : "孤児データはありません",
      stats: {
        before: targets.length,
        after: validTargets.length,
        removed: orphanCount,
      },
    });
  } catch (error) {
    console.error("Failed to cleanup orphan targets:", error);
    return NextResponse.json({ error: "クリーンアップに失敗しました" }, { status: 500 });
  }
}
```

**いつ使うか**

- サイトを削除した後、デプロイターゲット一覧を確認し、不要なターゲットが残っていたら実行する。
- 定期メンテナンスや、デプロイターゲット一覧ページの「クリーンアップ」ボタンから呼び出す運用が一般的。

**確認**
- サイトを削除した後に `POST /api/cleanup/orphan-targets` を呼ぶと、孤児データが削除される。

---

## 7-10. Docker イメージタグ取得 API

**何をするか**
**GET /api/docker/tags** で WordPress・MariaDB・MySQL・PHP の利用可能なバージョン一覧を返す。サイト作成フォームのバージョン選択に使う。

**手順**

`src/app/api/docker/tags/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";

// Docker Hub 取得に失敗した場合のフォールバック
const FALLBACK_TAGS = {
  wordpress: ["6.9", "6.8", "6.7", "6.6", "6.5"],
  mariadb: ["11.4", "10.11", "10.6", "10.5"],
  mysql: ["8.4", "8.0", "5.7"],
  php: ["8.3", "8.2", "8.1", "8.0"],
};

async function fetchDockerHubTags(image: string, limit = 10): Promise<string[]> {
  const res = await fetch(
    `https://hub.docker.com/v2/repositories/library/${image}/tags?page_size=${limit}&ordering=last_updated`,
    { next: { revalidate: 3600 } }  // 1時間キャッシュ
  );
  if (!res.ok) throw new Error(`Docker Hub fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.results as { name: string }[])
    .map((t) => t.name)
    .filter((name) => /^\d+(\.\d+)*$/.test(name));  // バージョン番号のみ
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const image = searchParams.get("image");

  try {
    if (image) {
      // 特定イメージのタグを取得
      const tags = await fetchDockerHubTags(image, 20);
      return NextResponse.json({ [image]: tags });
    }

    // 全イメージを並列取得
    const [wordpress, mariadb, mysql, php] = await Promise.allSettled([
      fetchDockerHubTags("wordpress"),
      fetchDockerHubTags("mariadb"),
      fetchDockerHubTags("mysql"),
      fetchDockerHubTags("php"),
    ]);

    return NextResponse.json({
      wordpress: wordpress.status === "fulfilled" ? wordpress.value : FALLBACK_TAGS.wordpress,
      mariadb: mariadb.status === "fulfilled" ? mariadb.value : FALLBACK_TAGS.mariadb,
      mysql: mysql.status === "fulfilled" ? mysql.value : FALLBACK_TAGS.mysql,
      php: php.status === "fulfilled" ? php.value : FALLBACK_TAGS.php,
    });
  } catch {
    // すべて失敗した場合はフォールバック
    return NextResponse.json(FALLBACK_TAGS);
  }
}
```

**ポイント**
- Docker Hub へのリクエストは `revalidate: 3600`（1時間）でキャッシュする。
- 取得に失敗しても `FALLBACK_TAGS` を返すため、サイト作成フォームが壊れない。
- `?image=wordpress` のように特定イメージだけ取得することも可能。

**確認**
- `GET /api/docker/tags` で WordPress・MariaDB・MySQL・PHP のバージョン一覧が返る。

---

## Step 7 のまとめと確認

- [ ] GET /api/containers で全サイトのコンテナ一覧が返る
- [ ] GET /api/containers/[id]/logs、POST /api/containers/[id]/restart が動く
- [ ] /containers ページでコンテナ一覧・ログ・再起動ができる
- [ ] GET /api/qrcode?url=xxx で QR コード（SVG）が返る
- [ ] GET /api/export/sites と GET /api/export/deploy-targets で設定がダウンロードできる
- [ ] POST /api/import/sites（merge/replace モード）と POST /api/import/deploy-targets でインポートできる
- [ ] POST /api/sites/[id]/regenerate で設定ファイルを再生成できる
- [ ] POST /api/open-folder と POST /api/open-terminal が OS ごとに動く
- [ ] POST /api/cleanup/orphan-targets で孤児ターゲットを削除できる
- [ ] GET /api/docker/tags でイメージバージョン一覧が返る

**ここまでで Step 7 は完了です。**
次は [Step 8：DB 同期](step-08-db-sync.md) に進んでください。
