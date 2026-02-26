# Step 1：開発環境の準備とプロジェクトの土台

[← ハンズオン目次](README.md)

**ゴール**：Node.js と Docker を用意し、Next.js プロジェクトを新規作成。shadcn/ui をセットアップし、「サイト一覧の元データ」を置く `data/sites.json` と、その形を表す TypeScript の型・CRUD ライブラリを定義する。

---

## 1-1. 開発環境の準備

**何をするか**
Node.js（v20 以上）と Docker をインストールし、動作確認します。カスタムホスト名で HTTPS を使う場合は mkcert も用意します。

**なぜ必要か**
- **Node.js**：Next.js は Node 上で動く。`npm run dev` に必須。
- **Docker**：WordPress と DB をコンテナで起動するため、このツールの前提。
- **mkcert**：`mysite.test` のようなローカル HTTPS でブラウザ警告を出さないため（任意）。

**手順**

```bash
# Node.js のバージョン確認（20以上推奨）
node -v

# 未導入なら https://nodejs.org/ または nvm でインストール

# Docker が動いているか確認
docker --version
docker compose version

# （任意）mkcert でローカル HTTPS（macOS の例）
brew install mkcert
mkcert -install   # 初回のみ
```

**確認**
- `node -v` で v20.x 以上が表示される
- `docker compose version` で Compose v2 が表示される

---

## 1-2. Next.js プロジェクトを新規作成

**何をするか**
別フォルダ（例: `wp-tether-handson`）に、Next.js の新規プロジェクトを作成します。

**手順**

```bash
# 作業用ディレクトリ（本プロジェクトとは別）に移動
cd ~/path/to/your/workspace

# Next.js プロジェクトを作成
npx create-next-app@latest wp-tether-handson

# プロンプトでは次のように選択：
# - TypeScript: Yes
# - ESLint: Yes
# - Tailwind CSS: Yes
# - src/ directory: Yes
# - App Router: Yes
# - Turbopack: お好みで
# - import alias: @/* のまま

cd wp-tether-handson
```

**確認**

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開き、「Welcome to Next.js」などが表示されれば OK。終了は `Ctrl+C`。

---

## 1-3. 追加パッケージのインストール

**何をするか**
本プロジェクトで使用するすべてのパッケージをインストールします。

**手順**

```bash
# 本番依存パッケージ
npm install \
  @hookform/resolvers \
  react-hook-form \
  zod \
  yaml \
  lucide-react \
  qrcode \
  radix-ui \
  class-variance-authority \
  clsx \
  tailwind-merge

# 開発依存パッケージ
npm install -D \
  @types/qrcode \
  tw-animate-css
```

**パッケージの役割**

| パッケージ | 用途 | 使用する Step |
|-----------|------|---------------|
| `react-hook-form` | フォーム状態管理 | Step 3（サイト作成フォーム） |
| `@hookform/resolvers` | react-hook-form と zod の連携 | Step 3 |
| `zod` | スキーマ定義・バリデーション | Step 3 |
| `yaml` | テンプレート YAML の読み込み | Step 5 |
| `lucide-react` | アイコン | 全体 |
| `qrcode` | QR コード生成 | Step 7 |
| `radix-ui` | アクセシブルな UI コンポーネント | 全体（shadcn/ui の依存） |
| `class-variance-authority` | バリアント付きコンポーネント | 全体（shadcn/ui） |
| `clsx` | 条件付きクラス名結合 | 全体（shadcn/ui） |
| `tailwind-merge` | Tailwind クラスのマージ | 全体（shadcn/ui） |
| `@types/qrcode` | qrcode の型定義 | Step 7 |
| `tw-animate-css` | Tailwind アニメーション | 全体（UI 演出） |

**確認**
- `package.json` の `dependencies` と `devDependencies` に上記が追加されている

---

## 1-4. shadcn/ui のセットアップ

**何をするか**
shadcn/ui を初期化し、コンポーネント追加の準備をします。

**なぜ shadcn/ui か**
- Radix UI ベースでアクセシビリティが確保されている
- コピー＆ペースト方式で、コンポーネントのカスタマイズが自由
- Tailwind CSS との相性が良い

**手順**

```bash
npx shadcn@latest init
```

対話形式で以下を選択：
- Style: **New York**（お好みで）
- Base color: **Slate**（お好みで）
- CSS variables: **Yes**

これにより、以下が自動生成されます：
- `components.json`：shadcn/ui の設定ファイル
- `src/lib/utils.ts`：ユーティリティ関数

**生成される `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**生成される `src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

`cn()` 関数は、条件付きでクラス名を結合し、Tailwind のクラス衝突を解決します。shadcn/ui コンポーネント全体で使用します。

**UI コンポーネントの追加（必要になったときに実行）**

```bash
# 例: ボタンとカードを追加
npx shadcn@latest add button card

# Step 2 で使う基本コンポーネント
npx shadcn@latest add badge separator tooltip skeleton

# Step 3 で使うフォームコンポーネント
npx shadcn@latest add form input select
```

**確認**
- `components.json` が存在する
- `src/lib/utils.ts` が存在し、`cn` 関数がエクスポートされている
- `npm run build` が通る

---

## 1-5. データの置き場所と型の定義

**何をするか**
「サイト一覧」の元データを `data/sites.json` に置くことにし、その形を TypeScript の型（`Site`, `SiteConfig`）で定義します。

**なぜ JSON ファイルか**
- ローカルで複数サイトを管理する用途のため、DB サーバーを立てずに済む。
- 編集・バックアップがしやすく、Git で履歴も追える。

**手順**

**1. データ用ディレクトリと空のサイト一覧を作成**

```bash
mkdir -p data
echo '{"sites":[]}' > data/sites.json
```

**2. 型定義ファイルを作成**

`src/types/index.ts` を新規作成します。Step 1 ではサイト管理に必要な型のみ定義し、デプロイ関連の型は Step 6 で追加します。

```typescript
// ===========================================
// サイト（プロジェクト）
// ===========================================
export interface Site {
  id: string;
  name: string;
  path: string; // docker-compose.ymlがあるディレクトリ
  config: SiteConfig;
  status: "running" | "stopped" | "creating" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface SiteConfig {
  projectName: string;
  hostname: string;
  /** ホスト名モード: custom = カスタムホスト名（要/etc/hosts）, localhost = localhost:port */
  hostnameMode: "custom" | "localhost";
  suffix: string;
  timezone: string;
  certName?: string;
  port: number;

  wordpress: {
    version: string; // e.g., "latest", "6.4", "6.3.2"
    debug: boolean;
    /** 初期インストール設定（オプション） */
    admin?: {
      user: string;
      password: string;
      email: string;
    };
    /** WordPress言語（例: ja, en_US） */
    locale?: string;
  };

  php: {
    version: string; // e.g., "8.2", "8.1", "7.4"
    /** php.ini 用（未指定時はデフォルト値を使用） */
    memoryLimit?: string;
    maxExecutionTime?: number;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    /** ロケール（例: ja_JP.UTF-8）。コンテナの LANG/LC_ALL にも反映 */
    locale?: string;
  };

  database: {
    type: "mariadb" | "mysql";
    version: string; // e.g., "10.6", "8.0"
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
}
```

**ポイント**
- `status` は 4 種類：`running`（起動中）、`stopped`（停止）、`creating`（作成中）、`error`（エラー）
- `hostnameMode` で `custom`（`mysite.test` 等）と `localhost`（`localhost:8080` 等）を切り替え
- WordPress、PHP、DB それぞれのバージョンを個別に管理

**確認**
- `data/sites.json` が存在し、`{"sites":[]}` である
- `src/types/index.ts` が存在する
- `npm run build` でエラーが出ない

---

## 1-6. サイト管理ライブラリの作成

**何をするか**
サイトの CRUD 操作と、Docker コンテナの実際の稼働状態を取得する関数を `src/lib/sites.ts` に実装します。

**手順**

`src/lib/sites.ts` を新規作成します。

```typescript
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site } from "@/types";

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), "data");
const SITES_FILE = path.join(DATA_DIR, "sites.json");

interface SitesData {
  sites: Site[];
}

/**
 * ~/を実際のホームディレクトリに展開
 */
export function expandPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * サイト一覧を取得
 */
export async function getSites(): Promise<Site[]> {
  try {
    const content = await fs.readFile(SITES_FILE, "utf-8");
    const data: SitesData = JSON.parse(content);
    return data.sites;
  } catch {
    return [];
  }
}

/**
 * サイトを保存
 */
export async function saveSites(sites: Site[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SITES_FILE, JSON.stringify({ sites }, null, 2));
}

/**
 * サイトを追加
 */
export async function addSite(site: Site): Promise<void> {
  const sites = await getSites();
  sites.push(site);
  await saveSites(sites);
}

/**
 * サイトを取得
 */
export async function getSite(id: string): Promise<Site | undefined> {
  const sites = await getSites();
  return sites.find((s) => s.id === id);
}

/**
 * サイトを更新
 */
export async function updateSite(
  id: string,
  updates: Partial<Site>
): Promise<Site | undefined> {
  const sites = await getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) return undefined;

  sites[index] = { ...sites[index], ...updates, updatedAt: new Date().toISOString() };
  await saveSites(sites);
  return sites[index];
}

/**
 * サイトを削除
 */
export async function deleteSite(id: string): Promise<boolean> {
  const sites = await getSites();
  const filtered = sites.filter((s) => s.id !== id);
  if (filtered.length === sites.length) return false;

  await saveSites(filtered);
  return true;
}

/**
 * サイトのDockerコンテナの実際の稼働状態を取得
 * WordPressコンテナ（wordpress）が running かどうかで判定
 */
async function getActualContainerStatus(
  sitePath: string
): Promise<"running" | "stopped" | "error"> {
  try {
    // docker compose ps でコンテナの状態を確認
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "ps", "--format", "json"],
      { cwd: sitePath, timeout: 10000 }
    );

    if (!stdout.trim()) {
      return "stopped";
    }

    // 各行がJSONオブジェクト（Docker Compose v2の出力形式）
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      try {
        const container = JSON.parse(line);
        // wordpressコンテナの状態をチェック
        if (
          container.Service === "wordpress" ||
          container.Name?.includes("wordpress")
        ) {
          if (container.State === "running") {
            return "running";
          }
        }
      } catch {
        // JSON解析エラーは無視
      }
    }

    return "stopped";
  } catch {
    // docker compose psが失敗した場合（ディレクトリが存在しない等）
    return "stopped";
  }
}

/**
 * サイト一覧を実際のコンテナ状態と共に取得
 * 設定ファイルのstatusと実際のコンテナ状態が異なる場合は実際の状態を反映
 */
export async function getSitesWithActualStatus(): Promise<Site[]> {
  const sites = await getSites();

  // 並列でコンテナ状態をチェック
  const sitesWithStatus = await Promise.all(
    sites.map(async (site) => {
      // creating/error状態のサイトはそのまま（セットアップ中の可能性）
      if (site.status === "creating" || site.status === "error") {
        return site;
      }

      const actualStatus = await getActualContainerStatus(site.path);

      // 実際の状態と異なる場合は更新
      if (site.status !== actualStatus) {
        return { ...site, status: actualStatus };
      }

      return site;
    })
  );

  return sitesWithStatus;
}
```

**ポイント**

| 関数 | 役割 | 使用する Step |
|------|------|---------------|
| `expandPath()` | `~/` をホームディレクトリに展開 | Step 3（パス指定） |
| `getSites()` | 全サイト取得 | Step 2（一覧表示） |
| `saveSites()` | サイト一覧を保存 | 内部利用 |
| `addSite()` | サイト追加 | Step 3（新規作成） |
| `getSite()` | 単一サイト取得 | Step 4 以降 |
| `updateSite()` | サイト更新 | Step 4（状態変更） |
| `deleteSite()` | サイト削除 | Step 5 |
| `getActualContainerStatus()` | Docker コンテナの実際の状態を取得 | Step 4（起動・停止） |
| `getSitesWithActualStatus()` | 実際のコンテナ状態を反映した一覧取得 | Step 4 |

**なぜ `execFile` を使うか**
- `exec` よりも安全（シェルインジェクションのリスクがない）
- 引数を配列で渡すため、スペースや特殊文字を含むパスでも正しく動作

**確認**
- `src/lib/sites.ts` が存在する
- `npm run build` でエラーが出ない

---

## 1-7. ディレクトリ構成の確認

Step 1 完了時点で、以下のファイル構成になります。

```
wp-tether-handson/
├── data/
│   └── sites.json              # サイト一覧データ（空の配列）
├── src/
│   ├── app/
│   │   ├── globals.css         # Tailwind + shadcn/ui のスタイル
│   │   ├── layout.tsx          # 自動生成（Step 2 で書き換え）
│   │   └── page.tsx            # 自動生成（Step 2 で編集）
│   ├── components/
│   │   └── ui/                 # shadcn/ui コンポーネント（追加時に生成）
│   ├── lib/
│   │   ├── utils.ts            # cn() 関数
│   │   └── sites.ts            # サイト管理ライブラリ
│   └── types/
│       └── index.ts            # 型定義
├── components.json             # shadcn/ui 設定
├── package.json
└── ...
```

---

## Step 1 のまとめと確認

- [ ] Node.js v20 以上と Docker が使える
- [ ] `wp-tether-handson` で `npm run dev` すると http://localhost:3000 が開く
- [ ] 追加パッケージがインストールされている（`package.json` を確認）
- [ ] `components.json` と `src/lib/utils.ts` が存在する（shadcn/ui）
- [ ] `data/sites.json` が存在し、`{"sites":[]}` である
- [ ] `src/types/index.ts` に `Site` と `SiteConfig` が定義されている
- [ ] `src/lib/sites.ts` に CRUD 関数とコンテナ状態取得関数がある
- [ ] `npm run build` が通る

**ここまでで Step 1 は完了です。**
次の [Step 2（サイト一覧の API とダッシュボード表示）](step-02-site-list.md) に進む前に、上記が問題ないか確認してください。
