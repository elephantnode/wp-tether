# Step 6：デプロイターゲットとファイル同期

[← ハンズオン目次](README.md)

**ゴール**：**デプロイターゲット**（リモートサーバーへの接続情報）を `data/deploy-targets.json` で管理し、一覧表示・追加・編集・削除ができるようにする。あわせて **ファイル同期（rsync）** の lib と API を実装し、「どのサイトのどのターゲットに Push/Pull するか」を指定して呼び出せるようにする。

---

## 6-1. 型とデータの置き場を用意する

**何をするか**
デプロイ先 1 件分の情報を表す **DeployTarget** 型を定義し、一覧を **data/deploy-targets.json** に保存する。サイト（Site）とは別で、1 サイトに複数ターゲット（例: staging / production）を紐づけられるようにする。

**なぜ JSON ファイルか**
- サイトと同様、DB を立てずに管理できる。
- 接続情報（SSH ホスト・パス・DB 情報）は機密なので、`data/` は **.gitignore に含める** 運用を推奨する。

**手順**

**1. 型を定義する**

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

  /** リモートのWP-CLI設定（検出結果をキャッシュ） */
  wpCli?: {
    available: boolean;
    path?: string; // 例: /usr/local/bin/wp
  };
}

// ===========================================
// デプロイ操作
// ===========================================
export type DeployDirection = "push" | "pull";

export type DeployScope =
  | "all"
  | "db"
  | "themes"
  | "plugins"
  | "uploads"
  | "mu-plugins"
  | "languages";

/**
 * 同期モード
 * - mirror: 完全同期（削除も含む）
 * - additive: 追加・更新のみ（削除しない）
 * - update: 新しいファイルのみ（宛先が新しければスキップ）
 */
export type SyncMode = "mirror" | "additive" | "update";
```

**2. データファイルの初期形**

```bash
mkdir -p data
echo '{"targets":[]}' > data/deploy-targets.json
```

**確認**
- `npm run build` が通る。

---

## 6-2. デプロイターゲットの読み書きライブラリ

**何をするか**
`src/lib/deploy-targets.ts` で、`getDeployTargets(siteId?)` / `addDeployTarget` / `getDeployTarget` / `updateDeployTarget` / `deleteDeployTarget` を実装する。

**手順**

`src/lib/deploy-targets.ts` を新規作成する。

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
- **POST /api/deploy-targets** … 新規ターゲットを追加。
- **GET /api/deploy-targets/[id]** … 1 件取得。
- **PUT /api/deploy-targets/[id]** … 更新。
- **DELETE /api/deploy-targets/[id]** … 削除。

**手順**

```bash
mkdir -p src/app/api/deploy-targets/[id]
```

**1. 一覧・作成 API の実装**

`src/app/api/deploy-targets/route.ts` を新規作成する。

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

**2. 単一取得・更新・削除 API の実装**

`src/app/api/deploy-targets/[id]/route.ts` を新規作成する。

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

---

## 6-4. ファイル同期ライブラリ（lib/sync.ts）

**何をするか**
rsync を使ったファイル同期の実装を `src/lib/sync.ts` にまとめる。スコープ（themes / plugins / uploads 等）ごとにローカル・リモートのパスを組み立て、SSH 経由で rsync を実行する。

**手順**

`src/lib/sync.ts` を新規作成する。

```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { DeployTarget, DeployDirection, DeployScope, SyncMode } from "@/types";

const execFileAsync = promisify(execFile);

/**
 * ホスト上で使う SSH キーパスに展開する（~ をホームディレクトリに置換）
 */
function expandKeyPathForHost(keyPath: string | undefined): string | undefined {
  if (!keyPath) return undefined;
  if (keyPath.startsWith("~/")) {
    return path.join(os.homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * スコープとWordPressパスのマッピング
 */
const SCOPE_PATHS: Record<Exclude<DeployScope, "all" | "db">, string> = {
  themes: "wp-content/themes/",
  plugins: "wp-content/plugins/",
  uploads: "wp-content/uploads/",
  "mu-plugins": "wp-content/mu-plugins/",
  languages: "wp-content/languages/",
};

/**
 * デフォルトの除外パターン
 */
const DEFAULT_EXCLUDES = [
  ".git/",
  ".DS_Store",
  "node_modules/",
  "*.log",
  ".env",
  "Thumbs.db",
];

interface SyncOptions {
  sitePath: string;
  target: DeployTarget;
  direction: DeployDirection;
  scopes: DeployScope[];
  dryRun?: boolean;
  mode?: SyncMode;
}

interface SyncResult {
  success: boolean;
  scope: DeployScope;
  output: string;
  error?: string;
}

/**
 * rsyncコマンドの引数を生成
 */
function buildRsyncArgs(
  localPath: string,
  remotePath: string,
  direction: DeployDirection,
  excludes: string[],
  sshOptions: string,
  dryRun: boolean,
  mode: SyncMode = "mirror"
): string[] {
  const args = ["-avz", "-e", sshOptions];

  // 同期モードに応じたフラグ
  switch (mode) {
    case "mirror":
      // 完全同期: 送信先を送信元と完全一致させる（削除も含む）
      args.push("--delete");
      break;
    case "additive":
      // 追加・更新のみ: 削除しない（デフォルトのrsync動作）
      break;
    case "update":
      // 新しいファイルのみ: 宛先が新しければスキップ
      args.push("--update");
      break;
  }

  // 除外パターン
  for (const pattern of excludes) {
    args.push("--exclude", pattern);
  }

  // dry-run
  if (dryRun) {
    args.push("--dry-run");
  }

  // 方向に応じてsourceとdestを設定
  if (direction === "push") {
    args.push(localPath, remotePath);
  } else {
    args.push(remotePath, localPath);
  }

  return args;
}

/**
 * SSH接続オプションを生成（ホストの ssh に渡す -e 用）
 */
function buildSSHOptions(target: DeployTarget): string {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { port } = target.ssh;
  const keyPath = expandKeyPathForHost(target.ssh.keyPath);
  let sshCmd = `ssh -o StrictHostKeyChecking=no -p ${port}`;

  if (keyPath) {
    sshCmd += ` -i ${keyPath}`;
  }

  return sshCmd;
}

/**
 * リモートパスを生成 (user@host:/path/)
 */
function buildRemotePath(target: DeployTarget, relativePath: string): string {
  if (!target.ssh) {
    throw new Error("SSH設定がありません");
  }

  const { host, user } = target.ssh;
  const fullPath = target.wordpressPath.endsWith("/")
    ? target.wordpressPath + relativePath
    : target.wordpressPath + "/" + relativePath;

  return `${user}@${host}:${fullPath}`;
}

/**
 * 単一スコープの同期を実行
 */
async function syncScope(
  sitePath: string,
  target: DeployTarget,
  scope: Exclude<DeployScope, "all" | "db">,
  direction: DeployDirection,
  dryRun: boolean,
  mode: SyncMode = "mirror"
): Promise<SyncResult> {
  try {
    const relativePath = SCOPE_PATHS[scope];
    const localPath = `${sitePath}/src/${relativePath}`;
    const remotePath = buildRemotePath(target, relativePath);
    const sshOptions = buildSSHOptions(target);
    const excludes = [...DEFAULT_EXCLUDES, ...target.exclude];

    const args = buildRsyncArgs(
      localPath,
      remotePath,
      direction,
      excludes,
      sshOptions,
      dryRun,
      mode
    );

    // ホストの rsync で実行
    const { stdout, stderr } = await execFileAsync("rsync", args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      success: true,
      scope,
      output: stdout + (stderr ? `\n${stderr}` : ""),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      scope,
      output: "",
      error: errorMessage,
    };
  }
}

/**
 * 同期を実行
 */
export async function executeSync(options: SyncOptions): Promise<SyncResult[]> {
  const { sitePath, target, direction, scopes, dryRun = false, mode = "mirror" } = options;
  const results: SyncResult[] = [];

  // "all" が含まれている場合は全スコープに展開（dbを除く）
  let targetScopes: Exclude<DeployScope, "all" | "db">[];
  if (scopes.includes("all")) {
    targetScopes = ["themes", "plugins", "uploads", "mu-plugins", "languages"];
  } else {
    targetScopes = scopes.filter(
      (s): s is Exclude<DeployScope, "all" | "db"> => s !== "all" && s !== "db"
    );
  }

  // 各スコープを順番に同期
  for (const scope of targetScopes) {
    const result = await syncScope(sitePath, target, scope, direction, dryRun, mode);
    results.push(result);

    // エラーが発生した場合は中断
    if (!result.success) {
      break;
    }
  }

  return results;
}

/**
 * SSH接続テスト
 */
export async function testSSHConnection(
  target: DeployTarget
): Promise<{ success: boolean; error?: string }> {
  if (!target.ssh) {
    return { success: false, error: "SSH設定がありません" };
  }

  try {
    const { host, user, port } = target.ssh;
    const keyPath = expandKeyPathForHost(target.ssh.keyPath);

    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(port),
    ];

    if (keyPath) {
      sshArgs.push("-i", keyPath);
    }

    sshArgs.push(`${user}@${host}`, "echo", "Connection successful");

    const { stdout } = await execFileAsync("ssh", sshArgs, {
      timeout: 30000,
    });

    if (stdout.includes("Connection successful")) {
      return { success: true };
    }

    return { success: false, error: "接続は確立されましたが、応答が不正です" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * リモートのWordPressパスを検証
 */
export async function validateRemotePath(
  target: DeployTarget
): Promise<{ success: boolean; error?: string }> {
  if (!target.ssh) {
    return { success: false, error: "SSH設定がありません" };
  }

  try {
    const { host, user, port } = target.ssh;
    const keyPath = expandKeyPathForHost(target.ssh.keyPath);

    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(port),
    ];

    if (keyPath) {
      sshArgs.push("-i", keyPath);
    }

    const wpPath = target.wordpressPath.endsWith("/")
      ? target.wordpressPath.slice(0, -1)
      : target.wordpressPath;

    // wp-config.php の存在確認（親ディレクトリにある場合も考慮）
    const checkPath1 = wpPath + "/wp-config.php";
    const checkPath2 = wpPath.replace(/\/[^/]+$/, "") + "/wp-config.php";

    const quotedPath1 = "'" + checkPath1.replace(/'/g, "'\"'\"'") + "'";
    const quotedPath2 = "'" + checkPath2.replace(/'/g, "'\"'\"'") + "'";
    const remoteCmd = `(test -f ${quotedPath1} || test -f ${quotedPath2}) && echo valid`;
    sshArgs.push(`${user}@${host}`, remoteCmd);

    const { stdout } = await execFileAsync("ssh", sshArgs, {
      timeout: 30000,
    });

    if (stdout.includes("valid")) {
      return { success: true };
    }

    return { success: false, error: "wp-config.php が見つかりません" };
  } catch {
    return { success: false, error: "パスの検証に失敗しました" };
  }
}
```

**ポイント**

| 関数 | 役割 |
|------|------|
| `buildRsyncArgs()` | rsync コマンドの引数を配列で生成（シェルインジェクション防止） |
| `buildSSHOptions()` | `-e "ssh -p 22 -i /path/to/key"` 形式のオプションを生成 |
| `buildRemotePath()` | `user@host:/path/wp-content/themes/` 形式のリモートパスを生成 |
| `syncScope()` | 単一スコープ（例: themes）の rsync を実行 |
| `executeSync()` | 複数スコープをまとめて同期（"all" は全スコープに展開） |
| `testSSHConnection()` | SSH 接続テスト |
| `validateRemotePath()` | リモートに wp-config.php があるか確認 |

**同期モードの使い分け**

`SyncMode` の選択は `buildRsyncArgs()` 内の `switch(mode)` で rsync フラグに変換される。

| モード | rsync フラグ | 動作 | 使うタイミング |
|--------|------------|------|--------------|
| `mirror` | `--delete` | 送信元と**完全一致**させる（宛先にしかないファイルを削除） | ローカル→本番への定期デプロイ、完全上書き |
| `additive` | （なし） | **追加・更新のみ**、削除しない | 本番にあるファイルを残したまま新ファイルだけ追加したい |
| `update` | `--update` | 宛先が**新しければスキップ**、古いファイルのみ更新 | 本番で手動更新したファイルを保護しつつ古いものだけ同期 |

> **注意**: `mirror` は宛先のファイルを削除するため、本番→ローカルの Pull で `mirror` を使うと本番にしかないファイル（アップロードなど）が消えることがある。Pull では通常 `additive` を使う。

**セキュリティ**
- rsync の引数は **execFile** の配列で渡す（シェルを経由しない）
- SSH オプションやパスを 1 つのコマンド文字列に連結して `exec` するとシェルインジェクションの危険があるため避ける

**確認**
- `npm run build` が通る。

---

## 6-5. ファイル同期 API（POST /api/sync）

**何をするか**
「指定したデプロイターゲットに対して、指定したスコープを Push または Pull する」という API を実装する。

**手順**

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

**確認**
- デプロイターゲットを登録したうえで、POST /api/sync に以下を渡すと API が応答する。

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "targetId": "ターゲットID",
    "direction": "push",
    "scopes": ["themes"],
    "dryRun": true
  }'
```

---

## 6-6. SSH 接続テスト API

**何をするか**
デプロイターゲット作成・編集時に SSH 接続をテストできるようにする。

**手順**

`src/app/api/deploy-targets/[id]/test/route.ts` を新規作成する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { testSSHConnection, validateRemotePath } from "@/lib/sync";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    // SSH 接続テスト
    const sshResult = await testSSHConnection(target);
    if (!sshResult.success) {
      return NextResponse.json({
        success: false,
        sshConnection: false,
        error: sshResult.error,
      });
    }

    // WordPress パス検証
    const pathResult = await validateRemotePath(target);

    return NextResponse.json({
      success: pathResult.success,
      sshConnection: true,
      wpPathValid: pathResult.success,
      error: pathResult.success ? undefined : pathResult.error,
    });
  } catch (error) {
    console.error("Connection test failed:", error);
    return NextResponse.json(
      { error: "接続テストに失敗しました" },
      { status: 500 }
    );
  }
}
```

**確認**
- `POST /api/deploy-targets/[id]/test` で SSH 接続テストができる。

---

## 6-7. デプロイ一覧ページ

**何をするか**
**/deploy** でデプロイターゲットをサイトごとにグループ化して一覧表示する。

**手順**

`src/app/deploy/page.tsx` を新規作成する。

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

**確認**
- `/deploy` で一覧が表示される。

---

## 6-8. ターゲット追加ページ

**何をするか**
`/deploy/new` でデプロイターゲットを追加するフォームを実装する。

**手順**

`src/app/deploy/new/page.tsx` を新規作成する（クライアントコンポーネント）。

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  siteId: z.string().min(1, "サイトを選択してください"),
  name: z.string().min(1, "ターゲット名を入力してください"),
  type: z.enum(["ssh", "sftp", "ftp"]),
  vhost: z.string().url("有効なURLを入力してください"),
  wordpressPath: z.string().min(1, "WordPressパスを入力してください"),
  sshHost: z.string().optional(),
  sshUser: z.string().optional(),
  sshPort: z.coerce.number().optional(),
  sshKeyPath: z.string().optional(),
  dbHost: z.string().min(1, "DBホストを入力してください"),
  dbName: z.string().min(1, "DB名を入力してください"),
  dbUser: z.string().min(1, "DBユーザーを入力してください"),
  dbPassword: z.string(),
  exclude: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Site {
  id: string;
  name: string;
}

export default function NewDeployTargetPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      siteId: "",
      name: "staging",
      type: "ssh",
      vhost: "",
      wordpressPath: "/var/www/html",
      sshHost: "",
      sshUser: "",
      sshPort: 22,
      sshKeyPath: "~/.ssh/id_rsa",
      dbHost: "localhost",
      dbName: "",
      dbUser: "",
      dbPassword: "",
      exclude: ".git/\nnode_modules/\n.DS_Store",
    },
  });

  useEffect(() => {
    async function fetchSites() {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.sites || []);
    }
    fetchSites();
  }, []);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/deploy-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: data.siteId,
          name: data.name,
          type: data.type,
          vhost: data.vhost,
          wordpressPath: data.wordpressPath,
          ssh: data.type === "ssh" ? {
            host: data.sshHost,
            user: data.sshUser,
            port: data.sshPort || 22,
            keyPath: data.sshKeyPath || undefined,
          } : undefined,
          database: {
            host: data.dbHost,
            name: data.dbName,
            user: data.dbUser,
            password: data.dbPassword || "",
          },
          exclude: data.exclude?.split(/\n/).map((s) => s.trim()).filter(Boolean) ?? [],
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "作成に失敗しました");
      }

      router.push("/deploy");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  const connectionType = form.watch("type");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">デプロイターゲット追加</h1>
        <p className="text-gray-500">リモートサーバーへの接続設定を追加します</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* サイト選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">サイト *</label>
          <select
            {...form.register("siteId")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">選択してください</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          {form.formState.errors.siteId && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.siteId.message}</p>
          )}
        </div>

        {/* ターゲット名 */}
        <div>
          <label className="block text-sm font-medium text-gray-700">ターゲット名 *</label>
          <input
            {...form.register("name")}
            placeholder="staging"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        {/* 接続タイプ */}
        <div>
          <label className="block text-sm font-medium text-gray-700">接続タイプ</label>
          <select
            {...form.register("type")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="ssh">SSH</option>
            <option value="sftp">SFTP</option>
            <option value="ftp">FTP</option>
          </select>
        </div>

        {/* サイトURL */}
        <div>
          <label className="block text-sm font-medium text-gray-700">サイトURL *</label>
          <input
            {...form.register("vhost")}
            placeholder="https://staging.example.com"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        {/* WordPressパス */}
        <div>
          <label className="block text-sm font-medium text-gray-700">WordPressパス *</label>
          <input
            {...form.register("wordpressPath")}
            placeholder="/var/www/html"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        {/* SSH設定 */}
        {connectionType === "ssh" && (
          <div className="space-y-4 border rounded p-4 bg-gray-50">
            <h3 className="font-medium">SSH設定</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">ホスト</label>
                <input
                  {...form.register("sshHost")}
                  placeholder="example.com"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">ユーザー</label>
                <input
                  {...form.register("sshUser")}
                  placeholder="user"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">ポート</label>
                <input
                  type="number"
                  {...form.register("sshPort")}
                  placeholder="22"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">鍵パス</label>
                <input
                  {...form.register("sshKeyPath")}
                  placeholder="~/.ssh/id_rsa"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* DB設定 */}
        <div className="space-y-4 border rounded p-4 bg-gray-50">
          <h3 className="font-medium">データベース設定</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">ホスト</label>
              <input
                {...form.register("dbHost")}
                placeholder="localhost"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">DB名</label>
              <input
                {...form.register("dbName")}
                placeholder="wordpress"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">ユーザー</label>
              <input
                {...form.register("dbUser")}
                placeholder="dbuser"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">パスワード</label>
              <input
                type="password"
                {...form.register("dbPassword")}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* 除外パターン */}
        <div>
          <label className="block text-sm font-medium text-gray-700">除外パターン（1行1パターン）</label>
          <textarea
            {...form.register("exclude")}
            rows={4}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "作成中…" : "作成"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/deploy")}
            className="rounded border border-gray-300 px-4 py-2"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
```

**確認**
- `/deploy/new` でフォームが表示され、送信するとターゲットが作成される。

---

## 6-9. SSH 認証方式：鍵認証とパスワード認証

**鍵認証（推奨）**

`keyPath` に秘密鍵のパスを指定する（`~` はホームディレクトリに展開）。

```text
~/.ssh/id_rsa       ← RSA 鍵（古い形式）
~/.ssh/id_ed25519   ← Ed25519 鍵（推奨）
```

`buildSSHOptions()` は `keyPath` がある場合に `-i [keyPath]` を追加する。鍵のパーミッションは `600` である必要があり、そうでない場合 SSH が拒否する。

```bash
chmod 600 ~/.ssh/id_ed25519
```

**パスワード認証 / SSH Agent**

`keyPath` を空にした場合は、`-i` フラグが付かない。このとき SSH は以下の順で認証を試みる。

1. `SSH_AUTH_SOCK` が設定されていれば **SSH Agent**（`ssh-agent`）を使用
2. `~/.ssh/config` の設定
3. インタラクティブなパスワード入力

> **注意**: Node.js サーバーからの SSH 実行はインタラクティブな入力を受け付けられないため、パスワード認証を使う場合は `sshpass` などのツールを組み合わせるか、SSH Agent を使う構成にする。本ツールでは **鍵認証を推奨**する。

**SFTP / FTP について**

型定義には `type: "ssh" | "sftp" | "ftp"` があるが、現在ファイル同期（rsync）は **SSH のみサポート**。SFTP・FTP は将来拡張用として型に含まれている。DB 同期は SSH 経由のコマンド実行で動作するため、ファイル同期と DB 同期の両方に SSH が必要。

---

## Step 6 のまとめと確認

- [ ] `DeployTarget` 型と `data/deploy-targets.json` がある
- [ ] `lib/deploy-targets.ts` で一覧取得・追加・取得・更新・削除ができる
- [ ] GET/POST /api/deploy-targets、GET/PUT/DELETE /api/deploy-targets/[id] が動く
- [ ] `lib/sync.ts` に `executeSync`、`testSSHConnection`、`validateRemotePath` がある
- [ ] POST /api/sync でファイル同期を呼び出せる
- [ ] POST /api/deploy-targets/[id]/test で SSH 接続テストができる
- [ ] /deploy でターゲット一覧が表示され、/deploy/new で追加できる
- [ ] SSH 鍵認証（推奨）または SSH Agent が設定されている

**ここまでで Step 6 は完了です。**
次は [Step 7：コンテナ管理・QR コード・エクスポート](step-07-other.md) に進んでください。
