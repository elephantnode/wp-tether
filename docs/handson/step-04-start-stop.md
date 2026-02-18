# Step 4：起動・停止 API と実際のコンテナ状態の反映

[← ハンズオン目次](README.md)

**ゴール**：ダッシュボードのサイトカードから「起動」「停止」ボタンで Docker コンテナを操作できるようにする。あわせて、**一覧取得時に実際のコンテナ状態（`docker compose ps`）を参照**し、sites.json の status と食い違っていても正しく表示する。

---

## 4-1. 実際のコンテナ状態を取得する（lib/sites.ts）

**何をするか**  
各サイトのディレクトリで `docker compose ps --format json` を実行し、WordPress コンテナが running かどうかで「起動中」「停止」を判定する関数を `lib/sites.ts` に追加する。その結果を使って、一覧取得時に「実際の状態」で上書きする **getSitesWithActualStatus()** も追加する。

**なぜ必要か**  
- ユーザーがターミナルで `docker compose down` した、またはクラッシュしたなど、**アプリの外で状態が変わることがある**。  
- sites.json の `status` だけを信じていると、実際は止まっているのに「起動中」と表示されてしまう。  
- 一覧を表示するたびに「今この瞬間のコンテナ状態」を取得して反映すれば、表示と実態が一致する。

**手順**

`src/lib/sites.ts` を開き、**ファイル先頭で `execFile` を import** し、`deleteSite` のあとに次のコードを追加する。

```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
```

（既に `execFile` や `execFileAsync` がある場合は追加不要。）

そのうえで、`deleteSite` の直後に以下を追加する。

```typescript
/**
 * サイトのDockerコンテナの実際の稼働状態を取得
 * WordPressコンテナ（wordpress）が running かどうかで判定
 *
 * 環境差への対応:
 * - 行区切りが \r\n のとき: split(/\r?\n/) で \n / \r\n のどちらでも分割
 * - 出力が配列 [...] のとき: 要素をループ。オブジェクトの場合は [parsed] として扱う
 * - 1行に複数JSONや改行が含まれるとき: パース失敗時のみ \n で分割し先頭を再パース
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

    // \n および \r\n のどちらでも行分割。各行を trim し空行を除外
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const container of items) {
          if (
            container.Service === "wordpress" ||
            container.Name?.includes("wordpress")
          ) {
            if (container.State === "running") {
              return "running";
            }
          }
        }
      } catch {
        // 1行に複数JSONや改行が含まれる場合: \n で分割し先頭のみ再パース
        const first = line.split("\n")[0]?.trim();
        if (first) {
          try {
            const container = JSON.parse(first);
            if (
              container.Service === "wordpress" ||
              container.Name?.includes("wordpress")
            ) {
              if (container.State === "running") {
                return "running";
              }
            }
          } catch {
            // 無視
          }
        }
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

`docker compose ps --format json` の出力は環境によって次のような違いがあり、以前はパース失敗で「Error parsing Docker compose output」や常に stopped 判定になることがありました。

| 違い | 対応 |
|------|------|
| 行区切りが `\r\n`（CRLF） | `split(/\r?\n/)` で `\n` / `\r\n` のどちらでも行に分割。各行は `trim()` し、空行は `filter(Boolean)` で除外 |
| 出力が配列 `[...]` になる | パース結果が配列ならその要素を、オブジェクトなら `[parsed]` としてループし、どちらの形式でも wordpress サービスを探す |
| 1行に複数JSONや途中改行が含まれる | `JSON.parse(line)` が失敗したときだけ、その行を `\n` で分割し、先頭の 1 行だけを再度 `JSON.parse` して wordpress の State を判定 |

これにより、環境が変わってもステータスが正しく判定される想定です。

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

`src/app/page.tsx` を開き、`getSites` を `getSitesWithActualStatus` に変更する。

```typescript
import { getSitesWithActualStatus } from "@/lib/sites";

export default async function Dashboard() {
  const sites = await getSitesWithActualStatus();
  // ...
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

`src/components/site-card.tsx` を、次のように変更する。

1. **先頭に `"use client";` を追加**（まだ無ければ）。
2. **useState と useRouter を import**  
   `import { useState } from "react";` と `import { useRouter } from "next/navigation";`
3. **props の status の型を具体化**  
   `status: string` を `status: "running" | "stopped" | "creating" | "error"` にしておく（Step 2 のままでよい場合はそのままでも可）。
4. **コンポーネント内で state とハンドラを定義**

```typescript
export function SiteCard({ site }: SiteCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
```

5. **表示部分にボタンとエラー表示を追加**  
   ステータスバッジの近くか、カードのフッターに「起動」「停止」ボタンを置く。ローディング中はボタンを disabled にし、error があればその下に表示する。

例（ステータスとボタンを並べる場合）：

```tsx
<div className="mt-1 flex items-center gap-2 text-xs">
  <span
    className={`inline-flex rounded px-2 py-0.5 font-medium ${
      site.status === "running"
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-600"
    }`}
  >
    {site.status === "running" ? "起動中" : "停止"}
  </span>
  <span className="text-gray-400">
    WP {site.wpVersion} · PHP {site.phpVersion} · {site.dbType}
  </span>
</div>
<div className="mt-2 flex gap-2">
  {isRunning ? (
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
```

**確認**  
- トップページで、停止中のサイトに「起動」ボタンが表示される。クリックするとコンテナが起動し、表示が「起動中」に変わり、「停止」ボタンに切り替わる。  
- 「停止」をクリックするとコンテナが止まり、表示が「停止」に戻り、「起動」ボタンが再度表示される。  
- ターミナルで `docker compose down` したあと、ページを再読み込みすると「停止」と表示され、起動ボタンで再度起動できる。

---

## Step 4 のまとめと確認

- [ ] `lib/sites.ts` に `getActualContainerStatus`（内部）と `getSitesWithActualStatus` がある
- [ ] `GET /api/sites` が `getSitesWithActualStatus()` を使い、実際のコンテナ状態を返している
- [ ] （任意）トップページが `getSitesWithActualStatus()` で一覧を取得している
- [ ] `POST /api/sites/[id]/start` で `docker compose up -d` と status 更新が行われる
- [ ] `POST /api/sites/[id]/stop` で `docker compose down` と status 更新が行われる
- [ ] サイトカードに「起動」「停止」ボタンがあり、クリックで API を呼び、`router.refresh()` で表示が更新される

**ここまでで Step 4 は完了です。**  
次は [Step 5：テンプレート YAML とサイト削除](step-05-templates-and-delete.md) に進んでください。
