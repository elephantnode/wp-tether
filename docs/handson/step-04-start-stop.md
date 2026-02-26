# Step 4：起動・停止 API と実際のコンテナ状態の反映

[← ハンズオン目次](README.md)

**ゴール**：ダッシュボードのサイトカードから「起動」「停止」ボタンで Docker コンテナを操作できるようにする。あわせて、**一覧取得時に実際のコンテナ状態（`docker compose ps`）を参照**し、sites.json の status と食い違っていても正しく表示する。

---

## 4-1. getActualContainerStatus を改良する（lib/sites.ts）

**何をするか**
Step 1 で実装した `getActualContainerStatus()` と `getSitesWithActualStatus()` を、環境差に対応した改良版に置き換えます。Step 1 の基本実装は `split("\n")` による単純な行分割でしたが、Docker のバージョンや OS によって出力形式が異なり、誤判定になることがあります。

**なぜ必要か**
- ユーザーがターミナルで `docker compose down` した、またはクラッシュしたなど、**アプリの外で状態が変わることがある**。
- sites.json の `status` だけを信じていると、実際は止まっているのに「起動中」と表示されてしまう。
- 一覧を表示するたびに「今この瞬間のコンテナ状態」を取得して反映すれば、表示と実態が一致する。

**仕組み**

| 関数 | 役割 |
|------|------|
| `getActualContainerStatus(sitePath)` | `docker compose ps --format json` を実行し、wordpress コンテナの State を判定 |
| `getSitesWithActualStatus()` | 全サイトの実際の状態を並列で取得し、sites.json の status と異なれば上書き |

**手順**

`src/lib/sites.ts` を開き、既存の `getActualContainerStatus` 関数と `getSitesWithActualStatus` 関数を以下に置き換える。`execFile` と `execFileAsync` は Step 1 で定義済みのため追加不要。

```typescript
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
 * 設定の status と実際のコンテナ状態が異なる場合は実際の状態を反映
 */
export async function getSitesWithActualStatus(): Promise<Site[]> {
  const sites = await getSites();

  const sitesWithStatus = await Promise.all(
    sites.map(async (site) => {
      if (site.status === "creating" || site.status === "error") {
        return site;
      }

      const actualStatus = await getActualContainerStatus(site.path);
      if (site.status !== actualStatus) {
        return { ...site, status: actualStatus };
      }
      return site;
    })
  );

  return sitesWithStatus;
}
```

**補足（環境差への対応）**

`docker compose ps --format json` の出力形式と WordPress コンテナ名は環境・バージョンによって異なります。

| 問題 | 対応 |
|------|------|
| 行区切りが `\r\n`（CRLF） | `split(/\r?\n/)` + `trim()` + `filter(Boolean)` で正規化 |
| NDJSON（1行1オブジェクト）か JSON配列かで形式が違う | すべての行をパースして `containers[]` に収集してから判定 |
| コンテナ名が `mysite_wp`（`${PROJECT_NAME}_wp`） | `Service === "wordpress"` に加えて `name.endsWith("_wp")` でも検出 |
| `State` フィールドがない Docker バージョン | `Status.startsWith("up")` をフォールバックに追加 |

デバッグ時は以下でそのまま出力を確認できます。

```bash
# サイトのディレクトリで実行
docker compose ps --format json
```

**確認**  
- `npm run build` が通る。

---

## 4-2. サイト一覧 API で「実際の状態」を返すようにする

**何をするか**  
`GET /api/sites` で、これまで使っていた `getSites()` の代わりに **getSitesWithActualStatus()** を呼ぶように変更する。

**手順**

`src/app/api/sites/route.ts` を開き、GET ハンドラ内の `getSites()` を `getSitesWithActualStatus()` に差し替える。import も合わせて変更する。

```typescript
import { getSitesWithActualStatus } from "@/lib/sites";

// GET 内
const sites = await getSitesWithActualStatus();
```

**確認**  
- ブラウザで http://localhost:3000/api/sites を開く。  
- 既にサイトがあり、そのサイトのディレクトリで `docker compose up -d` している場合は `status: "running"`、down している場合は `status: "stopped"` になっていること。  
- ターミナルで `docker compose down` したあと、再度 /api/sites を読み込むと `stopped` に変わること。

---

## 4-3. トップページのデータ取得を「実際の状態」にする（任意）

**何をするか**  
トップページ（`src/app/page.tsx`）でサイト一覧を取得するとき、Server Component から **getSites() の代わりに getSitesWithActualStatus()** を呼ぶようにする。こうすると、API を経由しない表示でも「今のコンテナ状態」が反映される。

**手順**

`src/app/page.tsx` を以下の内容に置き換える。Step 2 からの変更点は 2 つ：①`getSites` → `getSitesWithActualStatus`、② `displaySites` に `hostnameMode` を追加（SiteCard の props が増えたため）。

```typescript
import { SiteCard } from "@/components/site-card";
import { getSitesWithActualStatus } from "@/lib/sites";

export default async function Dashboard() {
  const sites = await getSitesWithActualStatus();

  const displaySites = sites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    hostname: site.config.hostname,
    hostnameMode: site.config.hostnameMode,
    path: site.path,
    port: site.config.port,
    wpVersion: site.config.wordpress.version,
    phpVersion: site.config.php.version,
    dbType: `${site.config.database.type === "mysql" ? "MySQL" : "MariaDB"} ${site.config.database.version}`,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">サイト一覧</h1>
        <p className="text-gray-500">管理中のWordPressサイト</p>
      </div>

      {displaySites.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displaySites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-500">
          <p>サイトがありません</p>
          <p className="text-sm">
            <a href="/sites/new" className="text-blue-600 hover:underline">新規サイト作成</a> から始めましょう
          </p>
        </div>
      )}
    </div>
  );
}
```

**確認**
- トップページを開いたとき、各カードの「起動中」「停止」表示が実際のコンテナ状態と一致する。

---

## 4-4. 起動 API を作る

**何をするか**  
`POST /api/sites/[id]/start` で、指定した id のサイトのディレクトリに移動して `docker compose up -d` を実行し、成功したら `updateSite(id, { status: "running" })` で sites.json を更新する。

**手順**

1. **ディレクトリを作成**

```bash
mkdir -p src/app/api/sites/[id]/start
```

2. **route.ts を実装**

`src/app/api/sites/[id]/start/route.ts` を新規作成し、次の内容を書く。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite, updateSite } from "@/lib/sites";
import { generatePhpIni } from "@/lib/docker-compose";

const execFileAsync = promisify(execFile);

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/start - サイトを起動
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // php/custom.ini が無いとマウントでディレクトリが作られ PHP が起動しない場合があるため、なければ作成
    const phpDir = path.join(site.path, "php");
    const customIniPath = path.join(phpDir, "custom.ini");
    try {
      await fs.access(customIniPath);
    } catch {
      await fs.mkdir(phpDir, { recursive: true });
      const phpIni = generatePhpIni({
        projectName: site.config.projectName,
        port: site.config.port,
        config: site.config,
      });
      await fs.writeFile(customIniPath, phpIni);
    }

    await execFileAsync("docker", ["compose", "up", "-d"], {
      cwd: site.path,
    });

    await updateSite(id, { status: "running" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to start site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "起動に失敗しました" },
      { status: 500 }
    );
  }
}
```

**補足（セキュリティ）**  
`exec("docker compose up -d", ...)` のように `exec` を使うと、コマンドが**シェル経由**で実行される。のちにコマンド文字列に変数（例: パス）を埋め込んだときにシェルインジェクションの危険がある。**execFile** はシェルを経由せず、引数を配列で渡すため安全。`docker compose` は `execFile("docker", ["compose", "up", "-d"], { cwd })` のように書く。

**確認**  
- `npm run build` が通る。  
- （後述のカードにボタンを足したあと）停止中のサイトで「起動」を押すと、コンテナが立ち、一覧の表示が「起動中」に変わる。

---

## 4-5. 停止 API を作る

**何をするか**  
`POST /api/sites/[id]/stop` で、指定した id のサイトのディレクトリで `docker compose down` を実行し、成功したら `updateSite(id, { status: "stopped" })` で sites.json を更新する。

**手順**

1. **ディレクトリを作成**

```bash
mkdir -p src/app/api/sites/[id]/stop
```

2. **route.ts を実装**

`src/app/api/sites/[id]/stop/route.ts` を新規作成し、次の内容を書く。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSite, updateSite } from "@/lib/sites";

const execFileAsync = promisify(execFile);

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/stop - サイトを停止
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    await execFileAsync("docker", ["compose", "down"], {
      cwd: site.path,
    });

    await updateSite(id, { status: "stopped" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to stop site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "停止に失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**  
- `npm run build` が通る。

---

## 4-6. サイトカードに「起動」「停止」ボタンを追加する

**何をするか**  
Step 2 で作った `SiteCard` は静的な表示だけだった。ここで **起動・停止ボタン** を追加し、クリック時に `POST /api/sites/[id]/start` または `stop` を呼んだあと `router.refresh()` でサーバーから再取得して表示を更新する。ボタンやローディング・エラー表示のために、**クライアントコンポーネント**（`"use client"`）に変更する。

**なぜ router.refresh() か**  
- Server Component で描画しているため、`refresh()` するとサーバーが再実行され、`getSitesWithActualStatus()` が再度呼ばれる。  
- その結果、最新の status が反映された HTML が返り、一覧の表示が「起動中」「停止」で更新される。

**手順**

`src/components/site-card.tsx` を以下の内容に置き換える。

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface SiteCardProps {
  site: {
    id: string;
    name: string;
    status: "running" | "stopped" | "creating" | "error";
    hostname: string;
    hostnameMode: "localhost" | "custom";
    path: string;
    port: number;
    wpVersion: string;
    phpVersion: string;
    dbType: string;
  };
}

export function SiteCard({ site }: SiteCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // status が "creating" のあいだは 3 秒ごとに再取得して自動更新する。
  // Step 3 でバックグラウンドセットアップが走っており、完了後に "running" へ変わる。
  useEffect(() => {
    if (site.status !== "creating") return;
    const id = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [site.status, router]);

  async function handleStart() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/start`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "起動に失敗しました");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStop() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/stop`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "停止に失敗しました");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  const isRunning = site.status === "running";
  const isCreating = site.status === "creating";

  const siteUrl =
    site.hostnameMode === "localhost"
      ? `http://localhost:${site.port}`
      : `https://${site.hostname}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="font-semibold text-gray-900">{site.name}</div>
      <div className="mt-1 text-sm text-gray-500">
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {siteUrl}
        </a>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs">
        <span
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
            site.status === "running"
              ? "bg-green-100 text-green-800"
              : site.status === "creating"
                ? "bg-blue-100 text-blue-700"
                : site.status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
          }`}
        >
          {isCreating && <Loader2 className="w-3 h-3 animate-spin" />}
          {site.status === "running"
            ? "起動中"
            : site.status === "creating"
              ? "作成中"
              : site.status === "error"
                ? "エラー"
                : "停止"}
        </span>
        <span className="text-gray-400">
          WP {site.wpVersion} · PHP {site.phpVersion} · {site.dbType}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        {isCreating ? (
          <span className="text-xs text-gray-400">セットアップ中は操作できません</span>
        ) : isRunning ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={isLoading}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? "停止中…" : "停止"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={isLoading}
            className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? "起動中…" : "起動"}
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

**確認**
- トップページで、停止中のサイトに「起動」ボタンが表示される。クリックするとコンテナが起動し、表示が「起動中」に変わり、「停止」ボタンに切り替わる。
- 「停止」をクリックするとコンテナが止まり、表示が「停止」に戻り、「起動」ボタンが再度表示される。
- ターミナルで `docker compose down` したあと、ページを再読み込みすると「停止」と表示され、起動ボタンで再度起動できる。
- 新規作成直後のカードは「作成中」バッジ＋スピナーで表示され、ページ操作なしで自動的に「起動中」へ切り替わる。

---

## Step 4 のまとめと確認

- [ ] `lib/sites.ts` の `getActualContainerStatus` が CRLF・配列形式に対応した改良版になっている
- [ ] `GET /api/sites` が `getSitesWithActualStatus()` を使い、実際のコンテナ状態を返している
- [ ] （任意）トップページが `getSitesWithActualStatus()` で一覧を取得している
- [ ] `POST /api/sites/[id]/start` で `docker compose up -d` と status 更新が行われる
- [ ] `POST /api/sites/[id]/stop` で `docker compose down` と status 更新が行われる
- [ ] サイトカードに「起動」「停止」ボタンがあり、クリックで API を呼び、`router.refresh()` で表示が更新される
- [ ] サイトカードが `running` / `stopped` / `creating` / `error` の 4 状態を正しく表示する
- [ ] `creating` 状態のカードは 3 秒ごとにポーリングし、セットアップ完了後に自動で「起動中」へ切り替わる

**ここまでで Step 4 は完了です。**  
次は [Step 5：テンプレート YAML とサイト削除](step-05-templates-and-delete.md) に進んでください。
