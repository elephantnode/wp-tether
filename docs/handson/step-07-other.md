# Step 7：コンテナ一覧・ログ、QR コード、トンネル、設定のエクスポート

[← ハンズオン目次](README.md)

**ゴール**：**コンテナ一覧**（全サイトの Docker コンテナを一覧表示し、ログ表示・再起動ができる）、**QR コード API**（URL を SVG で返す）、**トンネル（外部公開）** の API と lib の考え方、**設定のエクスポート**（サイト・デプロイターゲットを JSON でダウンロード）を実装する。これでハンズオンの Step 1〜7 が一通りそろう。

---

## 7-1. コンテナ一覧 API

**何をするか**  
全サイトについて、各サイトの `site.path` で `docker compose ps --format json -a` を実行し、コンテナ情報（ID・名前・サービス・イメージ・状態・ポート）を集めて **GET /api/containers** で返す。フロントはこの API を呼んで一覧表示する。

**手順**

1. **型の定義（API 内で export するか types に追加）**

```typescript
export interface ContainerInfo {
  id: string;
  name: string;
  service: string;
  image: string;
  state: "running" | "exited" | "paused" | "created" | "restarting" | "dead";
  status: string;
  ports: string;
  siteId: string;
  siteName: string;
}
```

2. **API の実装**

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
- サイトを 1 つ以上起動した状態で `GET /api/containers` を呼ぶと、`{ containers: [ ... ] }` が返る。

---

## 7-2. コンテナログ取得・再起動 API

**何をするか**  
- **GET /api/containers/[id]/logs** … 指定したコンテナ ID の `docker logs` を取得。クエリ `tail`（件数、デフォルト 100）をサポート。  
- **POST /api/containers/[id]/restart** … 指定したコンテナを `docker restart` する。

**手順**

1. **ログ取得**

`src/app/api/containers/[id]/logs/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

2. **再起動**

`src/app/api/containers/[id]/restart/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
- コンテナ一覧で取得した `id` を使って `/api/containers/[id]/logs?tail=50` でログが返る。  
- `/api/containers/[id]/restart` に POST すると、該当コンテナが再起動する。

---

## 7-3. コンテナ一覧ページ

**何をするか**  
**/containers** で、GET /api/containers の結果を表形式で表示する。サイトごとにグループ化し、各コンテナに「ログ」「再起動」ボタンを付ける。ログはダイアログやモーダルで表示する。

**手順**

`src/app/containers/page.tsx` をクライアントコンポーネントで作成する。

- `useState` で `containers`、`loading`、`selectedContainer`、`logs`、`logsLoading` を管理。  
- `useEffect` で `fetch("/api/containers")` を呼び、結果を `setContainers`。  
- サイト名でグループ化（`containers.reduce` など）し、各グループごとにテーブルでサービス名・コンテナ名・ID・イメージ・状態・ポートを表示。  
- 「ログ」クリックで `fetch(\`/api/containers/${container.id}/logs?tail=200\`)` を呼び、取得したログをダイアログ内に表示。  
- 「再起動」クリックで `fetch(\`/api/containers/${container.id}/restart\`, { method: "POST" })` を呼び、成功したら一覧を再取得。  
- 状態（running / exited など）は Badge で色分けすると分かりやすい。

本プロジェクトの `src/app/containers/page.tsx` には、Table・Dialog・DropdownMenu を使った完全な UI があるので、必要に応じて参照する。サイドバーに「コンテナ」リンク（`/containers`）を追加する。

**確認**  
- `/containers` で全サイトのコンテナが表示され、ログ表示・再起動ができる。

---

## 7-4. QR コード API

**何をするか**  
**GET /api/qrcode?url=xxx** で、指定した URL の QR コードを **SVG** で返す。トンネルで発行した公開 URL をスマートフォンで開くときなどに使う。

**手順**

1. **パッケージのインストール**

```bash
npm install qrcode
npm install -D @types/qrcode
```

2. **API の実装**

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

## 7-5. トンネル（外部公開）の考え方と API

**何をするか**  
ローカルで動いているサイト（例: localhost:8080）を、**cloudflared** や **ngrok** で一時的にインターネットに公開する。API では **POST /api/sites/[id]/tunnel** でトンネルを開始し、**GET** で状態・公開 URL を取得、**DELETE** で停止する。実際のプロセス起動・URL のパースは **lib/tunnel.ts** にまとめる。

**なぜトンネルか**  
- スマートフォンや他端末から、同じ LAN にいなくてもローカルサイトにアクセスしたいときがある。  
- cloudflared（Cloudflare Tunnel）や ngrok は、ローカルポートを一時的な公開 URL に紐づける。

**手順（API と lib の役割）**

1. **lib/tunnel.ts の役割**

- **getAvailableProviders()** … `cloudflared --version` や `ngrok version` が成功するかで、利用可能なプロバイダを返す。  
- **startTunnel(siteId, siteName, localUrl, preferredProvider?)** … プロバイダに応じて `spawn("cloudflared", ["tunnel", "--url", localUrl])` または ngrok を起動。標準エラー出力から公開 URL をパースし、メモリ上（Map）に保持。  
- **stopTunnel(siteId)** … 該当プロセスを kill。  
- **getTunnel(siteId)** … メモリ上のトンネル情報を返す。

本プロジェクトの `src/lib/tunnel.ts` では、`spawn` で子プロセスを起動し、stderr の出力を監視して URL を正規表現で取り出している。実装が長いため、ここでは「API が lib の startTunnel / stopTunnel / getTunnel を呼ぶ」形にし、lib の詳細は `src/lib/tunnel.ts` を参照する。

2. **API の実装**

`src/app/api/sites/[id]/tunnel/route.ts` を新規作成する。

- **GET** … `getTunnel(id)` と `getAvailableProviders()` を呼び、`{ tunnel, availableProviders }` を返す。  
- **POST** … body の `provider`（任意）を取得。`getSite(id)` でサイトを取得し、`localUrl = http://localhost:${site.config.port}` を組み立て。`startTunnel(id, site.name, localUrl, provider)` を呼び、成功したら `{ tunnel, availableProviders }` を返す。トンネル開始に失敗したら 500。  
- **DELETE** … `stopTunnel(id)` を呼び、`{ success: true }` を返す。

**確認**  
- cloudflared または ngrok をインストールしたうえで、POST すると公開 URL が返る。フロントでその URL を表示し、QR コード API で `/api/qrcode?url=...` を参照するとスマホで開ける。

---

## 7-6. 設定のエクスポート

**何をするか**  
**GET /api/export/sites** と **GET /api/export/deploy-targets** で、それぞれ `data/sites.json` の内容・`data/deploy-targets.json` の内容を、日付入りファイル名でダウンロードできるようにする。レスポンスヘッダーで `Content-Disposition: attachment; filename="..."` を付ける。

**手順**

1. **サイトのエクスポート**

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

2. **デプロイターゲットのエクスポート**

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
- 設定画面などに「サイトをエクスポート」「デプロイターゲットをエクスポート」リンク（`<a href="/api/export/sites" download>` など）を置くとよい。

---

## Step 7 のまとめと確認

- [ ] GET /api/containers で全サイトのコンテナ一覧が返る  
- [ ] GET /api/containers/[id]/logs、POST /api/containers/[id]/restart が動く  
- [ ] /containers ページでコンテナ一覧・ログ・再起動ができる  
- [ ] GET /api/qrcode?url=xxx で QR コード（SVG）が返る  
- [ ] トンネル API（GET/POST/DELETE /api/sites/[id]/tunnel）と lib/tunnel の役割を理解している  
- [ ] GET /api/export/sites と GET /api/export/deploy-targets で設定がダウンロードできる  

**ここまでで Step 7 は完了です。**  
ハンズオン Step 1〜7 で、wp-tether の主要な機能（サイト管理・起動停止・テンプレート・削除・デプロイ・コンテナ・QR・トンネル・エクスポート）を一通り扱いました。本プロジェクトの `src/` を参照しながら、不足している部分（インポート、DB 同期、トンネル lib の詳細など）を必要に応じて追加してください。
