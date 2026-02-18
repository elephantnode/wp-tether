# Step 1：開発環境の準備とプロジェクトの土台

[← ハンズオン目次](README.md)

**ゴール**：Node.js と Docker を用意し、Next.js プロジェクトを新規作成。さらに「サイト一覧の元データ」を置く `data/sites.json` と、その形を表す TypeScript の型を定義する。

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

# プロンプトでは次のように選択する想定です：
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
サイト作成フォーム（react-hook-form + zod）、テンプレート読み込み（yaml）、UI（shadcn 系）などに必要なパッケージを入れます。Step 2 ではまだフォームやテンプレートは使わないため、**Step 1 の時点では「型とデータ」に必要なものだけ**でも構いません。一括で入れておく場合は以下です。

**手順**

```bash
# フォーム・バリデーション・テンプレート・アイコン・QR
npm install @hookform/resolvers react-hook-form zod yaml lucide-react qrcode

# shadcn/ui 用（Tailwind とクラス名まわり）
npm install class-variance-authority clsx tailwind-merge

# Radix UI は shadcn コンポーネント追加時に必要になるので、後からでも可
# npm install @radix-ui/react-slot @radix-ui/react-dialog ...
```

**パッケージの役割（Step 1 で使うもの）**  
- **zod**：後で「サイト」の形をスキーマで定義し、API の入力検証に使う。  
- **yaml**：Step 5 でテンプレート（`templates/*.yml`）を読むときに使用。  
- その他は Step 3 以降のフォーム・UI で使用。詳細は [chapter-02-packages.md](chapter-02-packages.md) を参照。

**確認**  
- `package.json` の `dependencies` に上記が追加されている  

---

## 1-4. データの置き場所と型の定義

**何をするか**  
「サイト一覧」の元データを `data/sites.json` に置くことにし、その形を TypeScript の型（`Site`, `SiteConfig`）で定義します。

**なぜ JSON ファイルか**  
- ローカルで複数サイトを管理する用途のため、DB サーバーを立てずに済む。  
- 編集・バックアップがしやすく、Git で履歴も追える。

**手順**

1. **データ用ディレクトリと空のサイト一覧を作成**

```bash
mkdir -p data
echo '{"sites":[]}' > data/sites.json
```

2. **型定義ファイルを作成**

`src/types/index.ts` を新規作成し、次の内容を書きます（サイト管理に必要な部分だけ。デプロイ用の型は Step 6 で追加してよい）。

```typescript
// ===========================================
// サイト（プロジェクト）
// ===========================================
export interface Site {
  id: string;
  name: string;
  path: string; // docker-compose.yml があるディレクトリ
  config: SiteConfig;
  status: "running" | "stopped" | "creating" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface SiteConfig {
  projectName: string;
  hostname: string;
  /** ホスト名モード: custom = カスタムホスト名, localhost = localhost:port */
  hostnameMode: "custom" | "localhost";
  suffix: string;
  timezone: string;
  certName?: string;
  port: number;

  wordpress: {
    version: string;
    debug: boolean;
    admin?: { user: string; password: string; email: string };
    locale?: string;
  };

  php: {
    version: string;
    memoryLimit?: string;
    maxExecutionTime?: number;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    locale?: string;
  };

  database: {
    type: "mariadb" | "mysql";
    version: string;
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
}
```

3. **サイトの読み書き用のライブラリを用意**

`src/lib/sites.ts` を新規作成します。まずは「読み取り」と「パス展開」だけ実装します。

```typescript
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Site } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const SITES_FILE = path.join(DATA_DIR, "sites.json");

interface SitesData {
  sites: Site[];
}

/** ~/ をホームディレクトリに展開 */
export function expandPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/** サイト一覧を取得 */
export async function getSites(): Promise<Site[]> {
  try {
    const content = await fs.readFile(SITES_FILE, "utf-8");
    const data: SitesData = JSON.parse(content);
    return data.sites;
  } catch {
    return [];
  }
}
```

**確認**  
- `data/sites.json` が存在し、`{"sites":[]}` である  
- `src/types/index.ts` と `src/lib/sites.ts` が存在する  
- プロジェクトルートで `npm run build` を実行し、型エラーが出ない（getSites はまだ画面から呼ばないので、次の Step 2 で API 経由で確認する）  

---

## Step 1 のまとめと確認

- [ ] Node.js v20 以上と Docker が使える  
- [ ] `wp-tether-handson` で `npm run dev` すると http://localhost:3000 が開く  
- [ ] `data/sites.json` と `src/types/index.ts`、`src/lib/sites.ts` が存在し、ビルドが通る  

**ここまでで Step 1 は完了です。**  
次の [Step 2（サイト一覧の API とダッシュボード表示）](step-02-site-list.md) に進む前に、上記が問題ないか確認してください。
