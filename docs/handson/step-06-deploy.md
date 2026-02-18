# Step 6：デプロイターゲットとファイル同期

[← ハンズオン目次](README.md)

**ゴール**：**デプロイターゲット**（リモートサーバーへの接続情報）を `data/deploy-targets.json` で管理し、一覧表示・追加・編集・削除ができるようにする。あわせて **ファイル同期（rsync）** の API の入り口を用意し、「どのサイトのどのターゲットに Push/Pull するか」を指定して呼び出せるようにする。DB 同期は別 API で、ここでは考え方だけ触れる。

---

## 6-1. 型とデータの置き場を用意する

**何をするか**  
デプロイ先 1 件分の情報を表す **DeployTarget** 型を定義し、一覧を **data/deploy-targets.json** に保存する。サイト（Site）とは別で、1 サイトに複数ターゲット（例: staging / production）を紐づけられるようにする。

**なぜ JSON ファイルか**  
- サイトと同様、DB を立てずに管理できる。  
- 接続情報（SSH ホスト・パス・DB 情報）は機密なので、`data/` は **.gitignore に含める** 運用を推奨する。

**手順**

1. **型を定義する**

`src/types/index.ts` に、既存の Site のあとなどに次を追加する。

```typescript
// ===========================================
// デプロイ先（Wordmove 代替）
// ===========================================
export interface DeployTarget {
  id: string;
  siteId: string;
  name: string; // e.g., "staging", "production"
  type: "ssh" | "sftp" | "ftp";

  vhost: string; // e.g., "https://staging.example.com"
  wordpressPath: string; // e.g., "/var/www/html"

  database: {
    name: string;
    user: string;
    password: string;
    host: string;
    charset?: string;
  };

  ssh?: {
    host: string;
    user: string;
    port: number;
    keyPath?: string;
  };

  ftp?: {
    host: string;
    user: string;
    password: string;
    port: number;
    passive: boolean;
  };

  exclude: string[]; // rsync 除外パターン
}
```

2. **データファイルの初期形**

`data/deploy-targets.json` が無いとき用に、空の一覧でよい。

```json
{
  "targets": []
}
```

`lib` 側で `targets` が無い場合に `[]` を返すようにすれば、ファイルが無くても動作する。

**確認**  
- `npm run build` が通る。  
- （次の 6-2 で lib を追加したあと）API から `{ targets: [] }` が返る。

---

## 6-2. デプロイターゲットの読み書きライブラリ

**何をするか**  
`src/lib/deploy-targets.ts` で、`getDeployTargets(siteId?)` / `addDeployTarget` / `getDeployTarget` / `updateDeployTarget` / `deleteDeployTarget` を実装する。sites.ts と同様に、1 ファイルで「読む・書く・追加・更新・削除」をまとめる。

**手順**

1. **ファイルを作成**

```bash
touch src/lib/deploy-targets.ts
```

2. **実装を書く**

`src/lib/deploy-targets.ts` に以下を書く。

```typescript
import fs from "fs/promises";
import path from "path";
import { DeployTarget } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DEPLOY_TARGETS_FILE = path.join(DATA_DIR, "deploy-targets.json");

interface DeployTargetsData {
  targets: DeployTarget[];
}

export async function getDeployTargets(siteId?: string): Promise<DeployTarget[]> {
  try {
    const content = await fs.readFile(DEPLOY_TARGETS_FILE, "utf-8");
    const data: DeployTargetsData = JSON.parse(content);
    const targets = data.targets ?? [];
    if (siteId) {
      return targets.filter((t) => t.siteId === siteId);
    }
    return targets;
  } catch {
    return [];
  }
}

export async function saveDeployTargets(targets: DeployTarget[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DEPLOY_TARGETS_FILE, JSON.stringify({ targets }, null, 2));
}

export async function addDeployTarget(target: DeployTarget): Promise<void> {
  const targets = await getDeployTargets();
  targets.push(target);
  await saveDeployTargets(targets);
}

export async function getDeployTarget(id: string): Promise<DeployTarget | undefined> {
  const targets = await getDeployTargets();
  return targets.find((t) => t.id === id);
}

export async function updateDeployTarget(
  id: string,
  updates: Partial<DeployTarget>
): Promise<DeployTarget | undefined> {
  const targets = await getDeployTargets();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1) return undefined;

  targets[index] = { ...targets[index], ...updates };
  await saveDeployTargets(targets);
  return targets[index];
}

export async function deleteDeployTarget(id: string): Promise<boolean> {
  const targets = await getDeployTargets();
  const filtered = targets.filter((t) => t.id !== id);
  if (filtered.length === targets.length) return false;

  await saveDeployTargets(filtered);
  return true;
}
```

**確認**  
- `npm run build` が通る。

---

## 6-3. デプロイターゲットの API

**何をするか**  
- **GET /api/deploy-targets** … 一覧を返す。クエリ `siteId` があればそのサイトに紐づくターゲットだけ返す。  
- **POST /api/deploy-targets** … 新規ターゲットを追加。body に siteId, name, type, vhost, wordpressPath, ssh または ftp, database, exclude などを渡す。  
- **GET /api/deploy-targets/[id]** … 1 件取得。  
- **PUT /api/deploy-targets/[id]** … 更新。  
- **DELETE /api/deploy-targets/[id]** … 削除。

**手順**

1. **ディレクトリを作成**

```bash
mkdir -p src/app/api/deploy-targets
mkdir -p src/app/api/deploy-targets/[id]
```

2. **一覧・作成 API の実装**

`src/app/api/deploy-targets/route.ts` を新規作成し、次の内容を書く。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DeployTarget } from "@/types";
import { getDeployTargets, addDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") ?? undefined;
    const targets = await getDeployTargets(siteId);
    return NextResponse.json({ targets });
  } catch (error) {
    console.error("Failed to get deploy targets:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの取得に失敗しました" },
      { status: 500 }
    );
  }
}

interface CreateDeployTargetRequest {
  siteId: string;
  name: string;
  type: "ssh" | "sftp" | "ftp";
  vhost: string;
  wordpressPath: string;
  ssh?: { host: string; user: string; port: number; keyPath?: string };
  ftp?: { host: string; user: string; password: string; port: number; passive: boolean };
  database: { host: string; name: string; user: string; password: string; charset?: string };
  exclude?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDeployTargetRequest = await request.json();

    if (!body.siteId || !body.name || !body.type || !body.vhost || !body.wordpressPath) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    const site = await getSite(body.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "指定されたサイトが存在しません" },
        { status: 404 }
      );
    }

    if (body.type === "ssh" && !body.ssh) {
      return NextResponse.json(
        { error: "SSH接続にはSSH設定が必要です" },
        { status: 400 }
      );
    }
    if (body.type === "ftp" && !body.ftp) {
      return NextResponse.json(
        { error: "FTP接続にはFTP設定が必要です" },
        { status: 400 }
      );
    }

    const existingTargets = await getDeployTargets(body.siteId);
    if (existingTargets.some((t) => t.name === body.name)) {
      return NextResponse.json(
        { error: "同じ名前のデプロイターゲットが既に存在します" },
        { status: 400 }
      );
    }

    const target: DeployTarget = {
      id: randomUUID(),
      siteId: body.siteId,
      name: body.name,
      type: body.type,
      vhost: body.vhost,
      wordpressPath: body.wordpressPath,
      ssh: body.ssh,
      ftp: body.ftp,
      database: body.database,
      exclude: body.exclude || [],
    };

    await addDeployTarget(target);
    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("Failed to create deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの作成に失敗しました" },
      { status: 500 }
    );
  }
}
```

3. **単一取得・更新・削除 API の実装**

`src/app/api/deploy-targets/[id]/route.ts` を新規作成し、次の内容を書く。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeployTarget } from "@/types";
import {
  getDeployTarget,
  updateDeployTarget,
  deleteDeployTarget,
} from "@/lib/deploy-targets";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json({ target });
  } catch (error) {
    console.error("Failed to get deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: Partial<DeployTarget> = await request.json();
    delete body.id;
    delete body.siteId;

    const target = await updateDeployTarget(id, body);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json({ target });
  } catch (error) {
    console.error("Failed to update deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの更新に失敗しました" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteDeployTarget(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの削除に失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**  
- `curl http://localhost:3000/api/deploy-targets` で `{ "targets": [] }` が返る。  
- POST で 1 件追加したあと、GET でその 1 件が含まれる。  
- GET /api/deploy-targets?siteId=xxx で、そのサイトに紐づくターゲットだけ返る。

---

## 6-4. デプロイ一覧ページとターゲット追加フォーム

**何をするか**  
- **/deploy** … デプロイターゲットをサイトごとにグループ化して一覧表示する。サイドバーから「デプロイ」で遷移できるようにする。  
- **/deploy/new** … ターゲットを追加するフォーム。サイト選択、名前、接続種別（SSH/FTP）、vhost・WordPress パス・SSH 設定・DB 設定・除外パターンなどを入力し、POST /api/deploy-targets に送る。

**手順**

1. **一覧ページの実装**

`src/app/deploy/page.tsx` を新規作成する。Server Component で `getDeployTargets()` と `getSites()` を並列で呼び、サイトごとにターゲットをグループ化して表示する。

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Globe, FolderSync } from "lucide-react";
import { getDeployTargets } from "@/lib/deploy-targets";
import { getSites } from "@/lib/sites";

export default async function DeployPage() {
  const [targets, sites] = await Promise.all([
    getDeployTargets(),
    getSites(),
  ]);

  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const targetsBySite = new Map<string, typeof targets>();
  for (const target of targets) {
    const existing = targetsBySite.get(target.siteId) || [];
    existing.push(target);
    targetsBySite.set(target.siteId, existing);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">デプロイ</h1>
          <p className="text-muted-foreground">リモートサーバーとの同期設定</p>
        </div>
        <Button asChild>
          <Link href="/deploy/new">
            <Plus className="w-4 h-4 mr-2" />
            ターゲット追加
          </Link>
        </Button>
      </div>

      {targets.length > 0 ? (
        <div className="space-y-8">
          {Array.from(targetsBySite.entries()).map(([siteId, siteTargets]) => {
            const site = siteMap.get(siteId);
            if (!site) return null;
            return (
              <div key={siteId}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{site.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {siteTargets.length} ターゲット
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {siteTargets.map((target) => (
                    <Card key={target.id}>
                      <CardContent className="pt-4">
                        <div className="font-medium">{target.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {target.vhost}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {target.type.toUpperCase()} · {target.wordpressPath}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/deploy/${target.id}/edit`}>編集</Link>
                          </Button>
                          {/* 削除は DELETE /api/deploy-targets/[id] を呼ぶボタン */}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderSync className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">デプロイターゲットがありません</h3>
            <p className="text-muted-foreground mb-4">
              リモートサーバーへの接続設定を追加して、ファイル同期を始めましょう
            </p>
            <Button asChild>
              <Link href="/deploy/new">
                <Plus className="w-4 h-4 mr-2" />
                ターゲット追加
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

2. **ターゲット追加ページの実装**

`src/app/deploy/new/page.tsx` をクライアントコンポーネントで作成する。  
サイト一覧は `useEffect` で `fetch("/api/sites")` から取得し、`<select>` で siteId を選択。フォーム項目は siteId, name, type, vhost, wordpressPath、type が ssh のときは sshHost, sshUser, sshPort, sshKeyPath、database は dbHost, dbName, dbUser, dbPassword。除外パターンはテキストエリアで複数行を入力し、送信時に改行で split して配列にする。  
送信処理の例:

```typescript
const res = await fetch("/api/deploy-targets", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    siteId: form.getValues("siteId"),
    name: form.getValues("name"),
    type: form.getValues("type"),
    vhost: form.getValues("vhost"),
    wordpressPath: form.getValues("wordpressPath"),
    ssh: form.getValues("type") === "ssh" ? {
      host: form.getValues("sshHost"),
      user: form.getValues("sshUser"),
      port: Number(form.getValues("sshPort")) || 22,
      keyPath: form.getValues("sshKeyPath") || undefined,
    } : undefined,
    database: {
      host: form.getValues("dbHost"),
      name: form.getValues("dbName"),
      user: form.getValues("dbUser"),
      password: form.getValues("dbPassword") || "",
    },
    exclude: form.getValues("exclude")?.split(/\n/).map((s) => s.trim()).filter(Boolean) ?? [],
  }),
});
if (res.ok) router.push("/deploy");
```

本プロジェクトの `src/app/deploy/new/page.tsx` には React Hook Form + Zod を使った完全なフォームがあるので、必要に応じて参照する。

3. **サイドバーにデプロイリンクを追加**

`src/components/app-sidebar.tsx` のナビ項目に、次を追加する。

```tsx
<Link href="/deploy">
  <FolderSync className="w-4 h-4" />
  <span>デプロイ</span>
</Link>
```

（既存のアイコン・スタイルに合わせてクラスやコンポーネントを調整する。）

**確認**  
- `/deploy` で一覧が表示され、「ターゲット追加」で `/deploy/new` に飛ぶ。  
- フォームから 1 件登録すると `/deploy` に戻り、一覧にそのターゲットが表示される。

---

## 6-5. ファイル同期 API と lib/sync

**何をするか**  
「指定したデプロイターゲットに対して、指定したスコープ（themes / plugins / uploads など）を Push または Pull する」という **POST /api/sync** を実装する。実際の rsync 実行は **lib/sync.ts** の `executeSync` に任せ、API は targetId・direction・scopes を受け取り、サイトとターゲットを取得してから `executeSync` を呼ぶ。

**型の追加（未定義なら）**

`src/types/index.ts` に次を追加する。

```typescript
export type DeployDirection = "push" | "pull";

export type DeployScope =
  | "all"
  | "themes"
  | "plugins"
  | "uploads"
  | "mu-plugins"
  | "languages";

export type SyncMode = "mirror" | "additive" | "update";
```

**手順**

1. **POST /api/sync の実装**

`src/app/api/sync/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeployDirection, DeployScope, SyncMode } from "@/types";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";
import { executeSync } from "@/lib/sync";

interface SyncRequest {
  targetId: string;
  direction: DeployDirection;
  scopes: DeployScope[];
  dryRun?: boolean;
  mode?: SyncMode;
}

export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json();

    if (!body.targetId || !body.direction || !body.scopes || body.scopes.length === 0) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    const target = await getDeployTarget(body.targetId);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    const site = await getSite(target.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    if (target.type !== "ssh") {
      return NextResponse.json(
        { error: "現在SSH接続のみサポートしています" },
        { status: 400 }
      );
    }

    if (body.scopes.includes("db")) {
      return NextResponse.json(
        { error: "データベース同期は /api/db-sync を使用してください" },
        { status: 400 }
      );
    }

    const results = await executeSync({
      sitePath: site.path,
      target,
      direction: body.direction,
      scopes: body.scopes,
      dryRun: body.dryRun ?? false,
      mode: body.mode ?? "mirror",
    });

    const allSuccess = results.every((r) => r.success);
    const totalOutput = results
      .map((r) =>
        r.success ? `=== ${r.scope} ===\n${r.output}` : `=== ${r.scope} (エラー) ===\n${r.error}`
      )
      .join("\n\n");

    return NextResponse.json({
      success: allSuccess,
      results,
      output: totalOutput,
      dryRun: body.dryRun ?? false,
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同期に失敗しました" },
      { status: 500 }
    );
  }
}
```

2. **lib/sync.ts の要点**

同期の実体は `executeSync(options)` が担う。本プロジェクトの `src/lib/sync.ts` では次のような構成になっている。

- **スコープとローカルパス**  
  `themes` → `wp-content/themes/`、`plugins` → `wp-content/plugins/` など、スコープごとの相対パスを定数で持つ。ローカルは `sitePath/src/wp-content/themes/` のように `sitePath + "src/" + 相対パス`。
- **リモートパス**  
  `target.ssh` の host, user と `target.wordpressPath` から `user@host:/var/www/html/wp-content/themes/` のような文字列を組み立てる。**ユーザー入力は渡すだけにし、exec のコマンド文字列に埋め込まない。**
- **rsync の実行**  
  `execFile("rsync", args, { maxBuffer: 10 * 1024 * 1024 })` で実行。SSH 経由の場合は `-e "ssh -p 22 -i /path/to/key"` のように `-e` でオプションを渡す。引数は **配列** で組み立て、`buildRsyncArgs(localPath, remotePath, direction, excludes, sshOptions, dryRun, mode)` で `["-avz", "-e", sshOptions, "--exclude", ".git", ...]` を得る。
- **同期モード**  
  mirror のときは `--delete`、additive は付けない、update のときは `--update` を付ける。
- **executeSync**  
  scopes に "all" が含まれる場合は themes, plugins, uploads, mu-plugins, languages に展開。各スコープごとに上記 rsync を 1 回ずつ実行し、結果を配列で返す。1 つでも失敗したらそこで打ち切る実装が一般的。

**セキュリティ**  
rsync の引数は **execFile** の配列で渡す。SSH オプションやパスを 1 つのコマンド文字列に連結して `exec` するとシェルインジェクションの危険があるため避ける。

**確認**  
- デプロイターゲットを 1 件登録したうえで、POST /api/sync に `{ targetId, direction: "push", scopes: ["themes"] }` を渡すと、API が 200 で応答する（実際に rsync が成功するかは SSH 接続先次第）。  
- 本プロジェクトの `src/lib/sync.ts` をそのままコピーするか、上記の要点に沿って自前で `executeSync` と `buildRsyncArgs` を実装する。

---

## 6-6. DB 同期の考え方（ここでは実装しない）

**何をするか**  
DB 同期は **別 API（例: POST /api/db-sync）** で行う設計にする。ローカルの DB を mysqldump でエクスポートし、リモートに SCP などで送ってインポートする、またはその逆。URL の置換（ローカル URL → 本番 URL）は WP-CLI の `search-replace` で行う。  
Step 6 では「デプロイターゲットの管理」と「ファイル同期の API 入り口」までとし、DB 同期の実装は本プロジェクトの `src/lib/db-sync.ts` と `src/app/api/db-sync/route.ts` を参照する。

---

## Step 6 のまとめと確認

- [ ] `DeployTarget` 型と `data/deploy-targets.json` がある  
- [ ] `lib/deploy-targets.ts` で一覧取得・追加・取得・更新・削除ができる  
- [ ] GET/POST /api/deploy-targets、GET/PUT/DELETE /api/deploy-targets/[id] が動く  
- [ ] /deploy でターゲット一覧が表示され、/deploy/new で追加できる  
- [ ] サイドバーに「デプロイ」リンクがある  
- [ ] POST /api/sync の入り口があり、targetId・direction・scopes でファイル同期を呼び出せる（中身は lib/sync 参照）

**ここまでで Step 6 は完了です。**  
次は [Step 7：コンテナ一覧・ログ、QR コード、トンネル、設定のエクスポート](step-07-other.md) に進んでください。
