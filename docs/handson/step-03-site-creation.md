# Step 3：新規サイト作成フォームと POST API・Docker 用ファイル生成

[← ハンズオン目次](README.md)

**ゴール**：新規サイト作成フォームから送信した内容を **POST /api/sites** で受け取り、サイト用ディレクトリと **Docker 用の設定ファイル**（docker-compose.yml, .env, php/custom.ini など）を生成し、`data/sites.json` にサイトを追加する。ここでは「ファイルまで生成して一覧に表示される」ところまでを実装する。コンテナの自動起動や WordPress の初期セットアップは、Step 4 で「起動」を実装したあとに手動またはオプションで行う。

---

## 3-1. lib/sites.ts を拡張する

**何をするか**  
Step 1 では `getSites()` と `expandPath()` だけ用意した。ここで **saveSites / addSite / getSite / updateSite / deleteSite** を追加し、API からサイトの追加・更新・削除ができるようにする。

**手順**

`src/lib/sites.ts` を開き、既存の `getSites()` のあとに次の関数を追加する。

```typescript
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
```

**確認**  
- `npm run build` が通る。

---

## 3-2. Docker 用ファイルを生成するライブラリを用意する

**何をするか**  
サイトごとの `docker-compose.yml`・`.env`・`php/custom.ini`・WP-CLI 用 Dockerfile などを、**設定オブジェクト（SiteConfig）から文字列で組み立てる**関数を `src/lib/docker-compose.ts` にまとめる。

**方針**  
- 本プロジェクト（wp-tether）の **`src/lib/docker-compose.ts` をそのままコピー**して使うと、カスタムホスト名・Caddy・Mailpit まで含めた完全版になる。
- ここでは「localhost モードのみ」「WordPress + MariaDB + php.ini + .env + wpcli Dockerfile」に絞った **簡略版** を掲載する。必要なら後から本プロジェクトのファイルで差し替えてよい。

**手順**

1. **ファイルを作成**

```bash
touch src/lib/docker-compose.ts
```

2. **簡略版の実装を書く（localhost モードのみ）**

`src/lib/docker-compose.ts` に以下を書く。型 `SiteConfig` は `@/types` で定義済みとする。

```typescript
import { SiteConfig } from "@/types";

interface GenerateOptions {
  projectName: string;
  port: number;
  config: SiteConfig;
}

/**
 * docker-compose.yml を生成（localhost モードのみの簡略版）
 */
export function generateDockerCompose(options: GenerateOptions): string {
  const { projectName, port, config } = options;
  const dbService = config.database.type === "mysql" ? "mysql" : "mariadb";
  const dbImage =
    config.database.type === "mysql"
      ? `mysql:${config.database.version}`
      : `mariadb:${config.database.version}`;

  const wpTag =
    config.wordpress.version === "latest"
      ? `php${config.php.version}-apache`
      : `${config.wordpress.version}-php${config.php.version}-apache`;

  // .env の変数名（${PROJECT_NAME} など）をそのまま出力するには、シングルクォートの
  // 文字列で連結する。テンプレートリテラル内で \${VAR} と書くと JS が {VAR} を式として解釈してしまう。
  return `services:
  ${dbService}:
    container_name: ` + '${PROJECT_NAME}_db' + `
    image: ${dbImage}
    expose:
      - 3306
    volumes:
      - db_data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=` + '${MYSQL_ROOT_PASSWORD}' + `
      - MYSQL_USER=` + '${MYSQL_USER}' + `
      - MYSQL_PASSWORD=` + '${MYSQL_PASSWORD}' + `
      - MYSQL_DATABASE=` + '${MYSQL_DATABASE}' + `
      - TZ=` + '${TIMEZONE}' + `
    restart: always
    networks:
      - wp

  wordpress:
    container_name: ` + '${PROJECT_NAME}_wp' + `
    depends_on:
      - ${dbService}
    image: wordpress:${wpTag}
    restart: always
    ports:
      - "${port}:80"
    volumes:
      - ./src:/var/www/html
      - ./php/custom.ini:/usr/local/etc/php/conf.d/zzz-custom.ini:ro
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=` + '${WORDPRESS_DB_USER}' + `
      - WORDPRESS_DB_PASSWORD=` + '${WORDPRESS_DB_PASSWORD}' + `
      - WORDPRESS_DB_NAME=` + '${WORDPRESS_DB_NAME}' + `
      - WORDPRESS_DEBUG=` + '${WORDPRESS_DEBUG}' + `
      - TZ=` + '${TIMEZONE}' + `
    networks:
      - wp

networks:
  wp:
    name: ` + '${PROJECT_NAME}_wp' + `

volumes:
  db_data:
`;
}

/**
 * .env を生成
 */
export function generateEnvFile(options: GenerateOptions): string {
  const { projectName, config } = options;
  return `PROJECT_NAME=${projectName}
HOSTNAME=${config.hostname}
TIMEZONE=Asia/Tokyo

MYSQL_ROOT_PASSWORD=${config.database.rootPassword}
MYSQL_USER=${config.database.user}
MYSQL_PASSWORD=${config.database.password}
MYSQL_DATABASE=${config.database.name}

WORDPRESS_DB_HOST=${config.database.type === "mysql" ? "mysql" : "mariadb"}
WORDPRESS_DB_USER=${config.database.user}
WORDPRESS_DB_PASSWORD=${config.database.password}
WORDPRESS_DB_NAME=${config.database.name}
WORDPRESS_DEBUG=${config.wordpress.debug ? "1" : "0"}
`;
}

/**
 * php/custom.ini を生成
 */
export function generatePhpIni(options: GenerateOptions): string {
  const { config } = options;
  const php = config.php;
  const memoryLimit = php.memoryLimit ?? "300M";
  const maxExecutionTime = php.maxExecutionTime ?? 180;
  const uploadMaxFilesize = php.uploadMaxFilesize ?? "64M";
  const postMaxSize = php.postMaxSize ?? "64M";
  const timezone = config.timezone ?? "Asia/Tokyo";

  return `[PHP]
memory_limit = ${memoryLimit}
max_execution_time = ${maxExecutionTime}
upload_max_filesize = ${uploadMaxFilesize}
post_max_size = ${postMaxSize}
date.timezone = "${timezone}"
default_charset = "UTF-8"
`;
}

/**
 * WP-CLI 用 Dockerfile を生成
 */
export function generateWpcliDockerfile(): string {
  return `FROM wordpress:cli
USER root
RUN apk add --no-cache rsync openssh-client
RUN mkdir -p /home/www-data/.ssh && chown -R www-data:www-data /home/www-data/.ssh && chmod 700 /home/www-data/.ssh
USER www-data
`;
}
```

カスタムホスト名・Caddy・Mailpit を使う場合は、本プロジェクトの `src/lib/docker-compose.ts` をコピーして差し替える。

**確認**  
- `npm run build` が通る。

---

## 3-3. POST /api/sites を実装する

**何をするか**  
`POST /api/sites` でリクエスト body を受け取り、バリデーション → ディレクトリ作成 → 各種ファイル生成 → `addSite()` で `data/sites.json` に追加し、`201` で作成したサイトを返す。

**手順**

`src/app/api/sites/route.ts` を開き、既存の `GET` の下に **POST** を追加する。import も増やす。

1. **import と型の追加**

ファイル先頭で、次のように import と `CreateSiteRequest` 型を用意する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Site, SiteConfig } from "@/types";
import { getSites, addSite, expandPath } from "@/lib/sites";
import {
  generateDockerCompose,
  generateEnvFile,
  generatePhpIni,
  generateWpcliDockerfile,
} from "@/lib/docker-compose";

interface CreateSiteRequest {
  name: string;
  hostnameMode: "localhost" | "custom";
  hostname?: string;
  path: string;
  port?: number;
  template?: string;
  wpVersion: string;
  phpVersion: string;
  dbType: "mariadb" | "mysql";
  dbVersion: string;
  wpAdminUser: string;
  wpAdminPassword: string;
  wpAdminEmail: string;
  wpLocale: string;
}
```

2. **POST ハンドラの実装**

```typescript
export async function POST(request: NextRequest) {
  try {
    const body: CreateSiteRequest = await request.json();

    if (!body.name || !body.path) {
      return NextResponse.json(
        { error: "name, path are required" },
        { status: 400 }
      );
    }

    // サイト名は小文字英数字とハイフンのみ（パストラバーサル対策）
    if (!/^[a-z0-9-]+$/.test(body.name)) {
      return NextResponse.json(
        { error: "サイト名は小文字英数字とハイフンのみ使用できます" },
        { status: 400 }
      );
    }

    const existingSites = await getSites();
    if (existingSites.some((s) => s.name === body.name)) {
      return NextResponse.json(
        { error: "サイト名が既に存在します" },
        { status: 400 }
      );
    }

    const WORDPRESS_BASE_PORT = 8080;
    let port: number;
    if (body.port && typeof body.port === "number" && body.port >= 1024) {
      port = body.port;
    } else {
      const usedPorts = existingSites
        .map((s) => s.config.port)
        .filter((p) => p >= WORDPRESS_BASE_PORT);
      port = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : WORDPRESS_BASE_PORT;
    }

    if (existingSites.some((s) => s.config.port === port)) {
      return NextResponse.json(
        { error: "ポート番号が既に使用されています" },
        { status: 400 }
      );
    }

    const basePath = expandPath(body.path);
    const sitePath = path.join(basePath, body.name);

    const hostname =
      body.hostnameMode === "localhost"
        ? "localhost"
        : (body.hostname || `${body.name}.test`);

    const config: SiteConfig = {
      projectName: body.name,
      hostname,
      hostnameMode: body.hostnameMode,
      suffix: "local",
      timezone: "Asia/Tokyo",
      port,
      wordpress: {
        version: body.wpVersion,
        debug: true,
        admin: {
          user: body.wpAdminUser,
          password: body.wpAdminPassword,
          email: body.wpAdminEmail,
        },
        locale: body.wpLocale,
      },
      php: {
        version: body.phpVersion,
        locale: body.phpLocale ?? "ja_JP.UTF-8",
      },
      database: {
        type: body.dbType,
        version: body.dbVersion,
        name: "wordpress",
        user: "wordpress",
        password: "wordpress",
        rootPassword: "somewordpress",
      },
    };

    await fs.mkdir(sitePath, { recursive: true });
    await fs.mkdir(path.join(sitePath, "src"), { recursive: true });
    await fs.mkdir(path.join(sitePath, "php"), { recursive: true });
    await fs.mkdir(path.join(sitePath, "docker", "wpcli"), { recursive: true });

    const wpcliDockerfile = generateWpcliDockerfile();
    await fs.writeFile(
      path.join(sitePath, "docker", "wpcli", "Dockerfile"),
      wpcliDockerfile
    );

    const dockerCompose = generateDockerCompose({
      projectName: body.name,
      port,
      config,
    });
    await fs.writeFile(path.join(sitePath, "docker-compose.yml"), dockerCompose);

    const envFile = generateEnvFile({ projectName: body.name, port, config });
    await fs.writeFile(path.join(sitePath, ".env"), envFile);

    const phpIni = generatePhpIni({ projectName: body.name, port, config });
    await fs.writeFile(path.join(sitePath, "php", "custom.ini"), phpIni);

    const site: Site = {
      id: randomUUID(),
      name: body.name,
      path: sitePath,
      config,
      status: "stopped",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await addSite(site);

    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error("Failed to create site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create site" },
      { status: 500 }
    );
  }
}
```

**確認**

- 開発サーバーを起動した状態で、curl で POST を送る。指定した path（例: `~/wp-sites`）の下にサイト名のフォルダができ、その中に `docker-compose.yml`・`.env`・`php/custom.ini` などができていること。`data/sites.json` に 1 件追加されていること。

```bash
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-site",
    "hostnameMode": "localhost",
    "path": "~/wp-sites",
    "wpVersion": "latest",
    "phpVersion": "8.2",
    "dbType": "mariadb",
    "dbVersion": "10.6",
    "wpAdminUser": "admin",
    "wpAdminPassword": "adminpass",
    "wpAdminEmail": "admin@example.com",
    "wpLocale": "ja"
  }'
```

---

## 3-4. 新規サイト作成フォームを作る

**何をするか**  
`/sites/new` にフォームを置き、**Zod** でバリデーション・**react-hook-form** で送信し、**POST /api/sites** を呼んでからトップページへリダイレクトする。UI は Tailwind のみのシンプルな入力欄でよい（shadcn は未導入でも可）。

**手順**

1. **ページ用ディレクトリを作成**

```bash
mkdir -p src/app/sites/new
```

2. **フォームページを実装**

`src/app/sites/new/page.tsx` を新規作成する（クライアントコンポーネント）。

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  name: z
    .string()
    .min(1, "サイト名を入力してください")
    .regex(/^[a-z0-9-]+$/, "小文字英数字とハイフンのみ使用できます"),
  hostnameMode: z.enum(["localhost", "custom"]),
  hostname: z.string().optional(),
  path: z.string().min(1, "パスを入力してください"),
  wpVersion: z.string(),
  phpVersion: z.string(),
  dbType: z.enum(["mariadb", "mysql"]),
  dbVersion: z.string(),
  wpAdminUser: z.string().min(1, "管理者ユーザー名を入力してください"),
  wpAdminPassword: z.string().min(8, "8文字以上のパスワードを入力してください"),
  wpAdminEmail: z.string().email("有効なメールアドレスを入力してください"),
  wpLocale: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  hostnameMode: "localhost",
  hostname: "",
  path: "~/wp-sites",
  wpVersion: "latest",
  phpVersion: "8.2",
  dbType: "mariadb",
  dbVersion: "10.6",
  wpAdminUser: "admin",
  wpAdminPassword: "",
  wpAdminEmail: "admin@example.com",
  wpLocale: "ja",
};

export default function NewSitePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "作成に失敗しました");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">新規サイト作成</h1>
        <p className="text-gray-500">WordPress ローカル環境を作成します</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">サイト名 *</label>
          <input
            {...form.register("name")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            placeholder="my-site"
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">保存先パス *</label>
          <input
            {...form.register("path")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            placeholder="~/wp-sites"
          />
          {form.formState.errors.path && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.path.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">ホスト名モード</label>
          <select {...form.register("hostnameMode")} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2">
            <option value="localhost">localhost（ポート番号でアクセス）</option>
            <option value="custom">カスタムホスト名（例: mysite.test）</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">管理者ユーザー名 *</label>
          <input
            {...form.register("wpAdminUser")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
          {form.formState.errors.wpAdminUser && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.wpAdminUser.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">管理者パスワード *</label>
          <input
            type="password"
            {...form.register("wpAdminPassword")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
          {form.formState.errors.wpAdminPassword && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.wpAdminPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">管理者メール *</label>
          <input
            type="email"
            {...form.register("wpAdminEmail")}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
          {form.formState.errors.wpAdminEmail && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.wpAdminEmail.message}</p>
          )}
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
            onClick={() => router.push("/")}
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

3. **トップページから「新規サイト作成」へリンクする**

`src/app/page.tsx` の「サイトがありません」の下に、`/sites/new` へのリンクを追加する。

```tsx
// サイトが 0 件のときのブロック内に追加
<p className="text-sm">
  <a href="/sites/new" className="text-blue-600 hover:underline">新規サイト作成</a> から始めましょう
</a>
</p>
```

既に「新規サイト作成から始めましょう（Step 3 で実装）」と書いている場合は、その部分を上記の `<a href="/sites/new">` に差し替える。

**確認**

- http://localhost:3000/sites/new を開き、サイト名・パス・管理者情報を入力して「作成」を押す。
- 作成後トップに戻り、新しいサイトのカードが 1 枚表示される。
- 指定した path（例: `~/wp-sites/my-site`）に、`docker-compose.yml`・`.env`・`php/custom.ini` などが生成されている。

---

## Step 3 のまとめと確認

- [ ] `lib/sites.ts` に saveSites / addSite / getSite / updateSite / deleteSite がある
- [ ] `lib/docker-compose.ts` で docker-compose.yml・.env・php.ini・wpcli Dockerfile を生成できる
- [ ] `POST /api/sites` でバリデーション・ディレクトリ作成・ファイル生成・addSite が行われ、201 でサイトが返る
- [ ] `/sites/new` のフォームから送信するとサイトが作成され、トップに戻って一覧に表示される

**ここまでで Step 3 は完了です。**  
次は [Step 4：起動・停止 API と実際のコンテナ状態の反映](step-04-start-stop.md) に進んでください。
