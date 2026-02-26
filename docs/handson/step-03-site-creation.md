# Step 3：新規サイト作成フォームと POST API・Docker 用ファイル生成

[← ハンズオン目次](README.md)

**ゴール**：新規サイト作成フォームから送信した内容を **POST /api/sites** で受け取り、サイト用ディレクトリと **Docker 用の設定ファイル**（docker-compose.yml, .env, php/custom.ini, Caddyfile など）を生成する。そのままコンテナを自動起動して WordPress を初期セットアップし、`data/sites.json` のステータスが `"creating"` → `"running"` へ変わるところまでを実装する。

---

## 3-1. lib/sites.ts の確認

**何をするか**
Step 1 で `src/lib/sites.ts` に以下の関数を実装済みです。このステップで使用するので確認しておきましょう。

| 関数 | 役割 |
|------|------|
| `getSites()` | サイト一覧を取得 |
| `saveSites(sites)` | サイト一覧を保存 |
| `addSite(site)` | サイトを追加 |
| `getSite(id)` | 指定IDのサイトを取得 |
| `updateSite(id, updates)` | サイトを更新 |
| `deleteSite(id)` | サイトを削除 |
| `expandPath(path)` | `~/` をホームディレクトリに展開 |

**確認**
- `src/lib/sites.ts` に上記の関数がすべて存在する。

---

## 3-2. Docker 用ファイルを生成するライブラリを用意する

**何をするか**
サイトごとの `docker-compose.yml`・`.env`・`php/custom.ini`・WP-CLI 用 Dockerfile などを、**設定オブジェクト（SiteConfig）から文字列で組み立てる**関数を `src/lib/docker-compose.ts` にまとめる。

**方針**
Caddy・Mailpit・WP-CLI・Composer のすべてのサービスを含む **完全版** を最初から実装する。`generateCaddyfile()` もこのファイルに統合する。

**手順**

1. **ファイルを作成**

```bash
touch src/lib/docker-compose.ts
```

2. **完全版の実装を書く**

`src/lib/docker-compose.ts` に以下を書く。型 `SiteConfig` は `@/types` で定義済みとする。

```typescript
import { SiteConfig } from "@/types";

interface GenerateOptions {
  projectName: string;
  port: number;
  config: SiteConfig;
}

/**
 * docker-compose.yml を生成（Caddy・Mailpit・WP-CLI・Composer 含む完全版）
 */
export function generateDockerCompose(options: GenerateOptions): string {
  const { projectName, port, config } = options;
  const dbService = config.database.type === "mysql" ? "mysql" : "mariadb";
  const dbImage =
    config.database.type === "mysql"
      ? `mysql:${config.database.version}`
      : `mariadb:${config.database.version}`;

  // MySQL 認証プラグイン設定:
  // - MySQL < 8.4: --default-authentication-plugin=mysql_native_password
  // - MySQL 8.4.x: --mysql-native-password=ON
  // - MySQL >= 9.0 / latest: オプション不要
  // - MariaDB: オプション不要
  const dbVersion = config.database.version;
  const mysqlVersionNum = parseFloat(dbVersion);
  let dbCommand = "";
  if (config.database.type === "mysql") {
    if (dbVersion === "latest" || (!Number.isNaN(mysqlVersionNum) && mysqlVersionNum >= 9.0)) {
      dbCommand = "";
    } else if (!Number.isNaN(mysqlVersionNum) && mysqlVersionNum >= 8.4) {
      dbCommand = "--mysql-native-password=ON";
    } else {
      dbCommand = "--default-authentication-plugin=mysql_native_password";
    }
  }

  // WordPress イメージタグの決定
  const wpTag =
    config.wordpress.version === "latest"
      ? config.php.version === "latest"
        ? "latest"
        : `php${config.php.version}-apache`
      : config.php.version === "latest"
        ? config.wordpress.version
        : `${config.wordpress.version}-php${config.php.version}-apache`;

  const isLocalhostMode = config.hostnameMode === "localhost";

  // WORDPRESS_CONFIG_EXTRA に挿入する PHP コード
  // Docker Compose の変数展開（${VAR}）を避けるため、$を$$にエスケープ（Compose は$$→$に変換）
  let wpConfigExtra: string;
  if (isLocalhostMode) {
    wpConfigExtra = `$$scheme=(isset($$_SERVER['HTTPS'])&&$$_SERVER['HTTPS']==='on')?'https':'http';$$host=isset($$_SERVER['HTTP_HOST'])?$$_SERVER['HTTP_HOST']:'localhost:${port}';if(!defined('WP_HOME')){define('WP_HOME',$$scheme.'://'.$$host);}if(!defined('WP_SITEURL')){define('WP_SITEURL',$$scheme.'://'.$$host);}`;
  } else {
    wpConfigExtra = `if(isset($$_SERVER['HTTP_X_FORWARDED_PROTO'])){$$_SERVER['HTTPS']=($$_SERVER['HTTP_X_FORWARDED_PROTO']==='https')?'on':'off';$$scheme=$$_SERVER['HTTP_X_FORWARDED_PROTO'];}else{$$scheme=(isset($$_SERVER['HTTPS'])&&$$_SERVER['HTTPS']==='on')?'https':'http';}$$host=isset($$_SERVER['HTTP_X_FORWARDED_HOST'])?$$_SERVER['HTTP_X_FORWARDED_HOST']:(isset($$_SERVER['HTTP_HOST'])?$$_SERVER['HTTP_HOST']:'${config.hostname}');$$host=preg_replace('/:\\d+$/','',$$host);if(!defined('WP_HOME')){define('WP_HOME',$$scheme.'://'.$$host);}if(!defined('WP_SITEURL')){define('WP_SITEURL',$$scheme.'://'.$$host);}`;
  }
  // YAML の二重引用符の中で \ と " をエスケープ
  const wpConfigExtraEscaped = wpConfigExtra.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // ★ テンプレートリテラル内で Docker Compose 変数（${PROJECT_NAME} など）を
  //   そのまま出力するには \${...} と書く（\$ でドル記号をエスケープして JS 展開を防ぐ）。
  //   誤: \\${PROJECT_NAME} → バックスラッシュ1文字 + JS変数展開 → 未定義エラー
  //   正:  \${PROJECT_NAME} → リテラル文字列 "${PROJECT_NAME}" として出力

  return `services:

  ${dbService}:
    container_name: \${PROJECT_NAME}_db
    image: ${dbImage}
${dbCommand ? `    command: '${dbCommand}'` : ""}
    expose:
      - 3306
    volumes:
      - db_data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=\${MYSQL_ROOT_PASSWORD}
      - MYSQL_USER=\${MYSQL_USER}
      - MYSQL_PASSWORD=\${MYSQL_PASSWORD}
      - MYSQL_DATABASE=\${MYSQL_DATABASE}
      - TZ=\${TIMEZONE}
    restart: always
    networks:
      - wp

  wordpress:
    container_name: \${PROJECT_NAME}_wp
    depends_on:
      - ${dbService}
    image: wordpress:${wpTag}
    restart: always
${isLocalhostMode ? `    ports:
      - "${port}:80"` : `    ports:
      - "${port}:80"
    expose:
      - 80`}
    volumes:
      - ./src:/var/www/html
      - ./php/custom.ini:/usr/local/etc/php/conf.d/zzz-custom.ini:ro
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=\${WORDPRESS_DB_USER}
      - WORDPRESS_DB_PASSWORD=\${WORDPRESS_DB_PASSWORD}
      - WORDPRESS_DB_NAME=\${WORDPRESS_DB_NAME}
      - WORDPRESS_DEBUG=\${WORDPRESS_DEBUG}
      - WORDPRESS_SMTP_HOST=mailpit
      - WORDPRESS_SMTP_PORT=1025
      - "WORDPRESS_CONFIG_EXTRA=${wpConfigExtraEscaped}"
      - TZ=\${TIMEZONE}
${config.php.locale ? `      - LANG=${config.php.locale}\n      - LC_ALL=${config.php.locale}` : ""}
    networks:
      - wp

${isLocalhostMode ? "" : `  caddy:
    container_name: \${PROJECT_NAME}_caddy
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./certs:/etc/caddy/certs:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - TZ=\${TIMEZONE}
    depends_on:
      - wordpress
    networks:
      - wp

`}  mailpit:
    container_name: \${PROJECT_NAME}_mailpit
    image: axllent/mailpit
    restart: always
    ports:
      - "${port + 1000}:8025"
    expose:
      - 1025
    environment:
      - TZ=\${TIMEZONE}
    networks:
      - wp

  # WP-CLI + rsync/ssh: docker compose run --rm wpcli <command>
  wpcli:
    container_name: \${PROJECT_NAME}_wpcli
    build:
      context: ./docker/wpcli
      dockerfile: Dockerfile
    depends_on:
      - ${dbService}
      - wordpress
    volumes:
      - ./src:/var/www/html
      - ~/.ssh:/home/www-data/.ssh:ro
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=\${WORDPRESS_DB_USER}
      - WORDPRESS_DB_PASSWORD=\${WORDPRESS_DB_PASSWORD}
      - WORDPRESS_DB_NAME=\${WORDPRESS_DB_NAME}
    networks:
      - wp
    user: "33:33"
    entrypoint: ["wp", "--allow-root"]
    profiles:
      - cli

  # Composer: docker compose run --rm composer <command>
  composer:
    container_name: \${PROJECT_NAME}_composer
    image: composer:latest
    volumes:
      - ./src:/app
    working_dir: /app
    networks:
      - wp
    profiles:
      - cli

networks:
  wp:
    name: \${PROJECT_NAME}_wp

volumes:
  db_data:${isLocalhostMode ? "" : `
  caddy_data:
  caddy_config:`}
`;
}

export interface CaddyfileOptions extends GenerateOptions {
  /** mkcert で発行した証明書を使う場合 true */
  useMkcert?: boolean;
}

/**
 * Caddyfile を生成（ホスト名ベースのルーティング）
 * useMkcert: true のときは certs/cert.pem と certs/key.pem を使用
 */
export function generateCaddyfile(options: CaddyfileOptions): string {
  const { config, useMkcert } = options;

  const tlsDirective = useMkcert
    ? `tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem`
    : "tls internal";

  return `{
  local_certs
}

# ${config.hostname} - ポート番号なしでアクセス可能（HTTP/HTTPS自動対応）
${config.hostname} {
  ${tlsDirective}
  reverse_proxy wordpress:80 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
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

  return `; wp-tether カスタム php.ini（起動時に自動読み込み）
[PHP]
memory_limit = ${memoryLimit}
max_execution_time = ${maxExecutionTime}
max_input_time = 120

; アップロード（画像・メディアの上限）
upload_max_filesize = ${uploadMaxFilesize}
post_max_size = ${postMaxSize}

; 日付・タイムゾーン
date.timezone = "${timezone}"

; 文字コード（UTF-8。WordPress 標準）
default_charset = "UTF-8"

; 外部 URL 取得（Off だとテーマ・プラグインの不具合の原因になりやすい）
allow_url_fopen = On

; 一度に受け取れる入力数
max_input_vars = 3000
`;
}

/**
 * .env を生成
 */
export function generateEnvFile(options: GenerateOptions): string {
  const { projectName, config } = options;

  return `# -------------------------------------------
# PROJECT SETTINGS
# -------------------------------------------
PROJECT_NAME=${projectName}
HOSTNAME=${config.hostname}
TIMEZONE=Asia/Tokyo

# -------------------------------------------
# DATABASE
# -------------------------------------------
MYSQL_ROOT_PASSWORD=${config.database.rootPassword}
MYSQL_USER=${config.database.user}
MYSQL_PASSWORD=${config.database.password}
MYSQL_DATABASE=${config.database.name}

# -------------------------------------------
# WORDPRESS
# -------------------------------------------
WORDPRESS_DB_HOST=${config.database.type === "mysql" ? "mysql" : "mariadb"}
WORDPRESS_DB_USER=${config.database.user}
WORDPRESS_DB_PASSWORD=${config.database.password}
WORDPRESS_DB_NAME=${config.database.name}
WORDPRESS_DEBUG=${config.wordpress.debug ? "1" : "0"}

# -------------------------------------------
# SMTP (Mailpit)
# -------------------------------------------
WORDPRESS_SMTP_HOST=mailpit
WORDPRESS_SMTP_PORT=1025
`;
}

/**
 * WP-CLI 用 Dockerfile を生成（rsync/ssh 付き）
 */
export function generateWpcliDockerfile(): string {
  return `# WP-CLI + rsync/ssh
FROM wordpress:cli

USER root

# wordpress:cli は Alpine ベースのため apk を使用
RUN apk add --no-cache rsync openssh-client

RUN mkdir -p /home/www-data/.ssh && \\
    chown -R www-data:www-data /home/www-data/.ssh && \\
    chmod 700 /home/www-data/.ssh

USER www-data
`;
}
```

**各サービスの役割**

| サービス | イメージ | 役割 |
|---------|---------|------|
| `mariadb` / `mysql` | mariadb / mysql | WordPress 用 DB |
| `wordpress` | wordpress:php-apache | WordPress 本体 |
| `caddy` | caddy:2-alpine | リバースプロキシ・HTTPS（カスタムモードのみ） |
| `mailpit` | axllent/mailpit | メール送信キャプチャ（Web UI で確認） |
| `wpcli` | wordpress:cli（カスタム） | WP-CLI コマンド実行（profile: cli） |
| `composer` | composer:latest | PHP パッケージ管理（profile: cli） |

> **`profiles: cli` とは**
> `wpcli` と `composer` は通常起動（`docker compose up -d`）では起動しない。`docker compose run --rm wpcli` のように手動で実行したときだけ起動する。

**確認**
- `npm run build` が通る。

---

## 3-2b. Caddy の仕組み（補足）

**localhost モードとカスタムホスト名モードの違い**

| | localhost モード | カスタムホスト名モード |
|-|----------------|-------------------|
| アクセス URL | `http://localhost:8080` | `https://mysite.test` |
| ポート公開 | WordPress が直接 `8080:80` を公開 | Caddy が `80:80` `443:443` を受け取り転送 |
| SSL | なし | あり（mkcert または自己署名） |
| `/etc/hosts` 編集 | 不要 | 必要（`127.0.0.1 mysite.test`） |
| Caddy サービス | 生成されない | 生成される |

**Caddy の動き**

カスタムホスト名モードでは、`generateDockerCompose()` が Caddy サービスを含む `docker-compose.yml` を出力する。Caddyfile には次のルールが書かれる。

```
mysite.test {
  tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem  # mkcert 証明書
  reverse_proxy wordpress:80 { ... }                         # Docker ネットワーク内の WP へ転送
}
```

mkcert がインストールされていない場合は `tls internal`（Caddy 自己署名）を使う。どちらでもブラウザアクセスは可能だが、`tls internal` は初回に「信頼されていない証明書」の警告が出る。

---

## 3-3. POST /api/sites を実装する

**何をするか**
`POST /api/sites` でリクエスト body を受け取り、バリデーション → ディレクトリ作成 → 各種ファイル生成 → `addSite()` でサイトを登録（ステータス `"creating"`）→ バックグラウンドでコンテナ起動・WordPress 初期セットアップを実行し、ステータスを `"running"` に更新する。API は即座に `201` を返す。

**手順**

`src/app/api/sites/route.ts` を開き、既存の `GET` の下に **POST** を追加する。

1. **import と型の追加**

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site, SiteConfig } from "@/types";
import { getSites, addSite, updateSite, expandPath } from "@/lib/sites";
import {
  generateDockerCompose,
  generateEnvFile,
  generateCaddyfile,
  generatePhpIni,
  generateWpcliDockerfile,
} from "@/lib/docker-compose";

const execFileAsync = promisify(execFile);

interface CreateSiteRequest {
  name: string;
  hostnameMode: "localhost" | "custom";
  hostname?: string;
  path: string;
  port?: number;
  wpVersion: string;
  phpVersion: string;
  dbType: "mariadb" | "mysql";
  dbVersion: string;
  /** php.ini カスタム（任意） */
  phpMemoryLimit?: string;
  phpMaxExecutionTime?: number;
  phpUploadMaxFilesize?: string;
  phpPostMaxSize?: string;
  phpLocale?: string;
  /** WordPress 初期設定 */
  wpAdminUser: string;
  wpAdminPassword: string;
  wpAdminEmail: string;
  wpLocale: string;
}

/** WP-CLI 実行タイムアウト（初回はイメージビルドで長くかかる） */
const WPCLI_TIMEOUT_MS = 120_000;
```

2. **ヘルパー関数を追加**

バックグラウンドセットアップで使う 3 つのユーティリティを追加する。

```typescript
/** wp-config.php の生成を待つ（最大 40×1.5s = 60 秒） */
async function waitForWpConfig(sitePath: string, maxAttempts = 40): Promise<boolean> {
  const wpConfigPath = path.join(sitePath, "src", "wp-config.php");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fs.access(wpConfigPath);
      return true;
    } catch {
      // まだない
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

/** DB の準備完了を待つ（最大 30×1s = 30 秒） */
async function waitForDatabase(sitePath: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["compose", "run", "--rm", "wpcli", "db", "check"],
        { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
      );
      if (stdout.includes("Success") || !stdout.includes("Error")) return true;
    } catch {
      // まだ準備中
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/** WordPress のインストール状態を確認 */
async function isWordPressInstalled(sitePath: string): Promise<boolean> {
  try {
    await execFileAsync(
      "docker",
      ["compose", "run", "--rm", "wpcli", "core", "is-installed"],
      { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
    );
    return true;
  } catch {
    return false;
  }
}
```

3. **POST ハンドラの実装**

```typescript
export async function POST(request: NextRequest) {
  try {
    const body: CreateSiteRequest = await request.json();

    if (!body.name || !body.path) {
      return NextResponse.json({ error: "name, path are required" }, { status: 400 });
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
      return NextResponse.json({ error: "サイト名が既に存在します" }, { status: 400 });
    }

    // ポート番号の自動生成（指定されない場合は 8080 から順に割り当て）
    let port: number;
    if (body.port && typeof body.port === "number" && body.port > 0) {
      port = body.port;
    } else {
      const WORDPRESS_BASE_PORT = 8080;
      const usedPorts = existingSites
        .map((s) => s.config.port)
        .filter((p) => p >= WORDPRESS_BASE_PORT);
      port = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : WORDPRESS_BASE_PORT;
    }

    if (existingSites.some((s) => s.config.port === port)) {
      return NextResponse.json({ error: "ポート番号が既に使用されています" }, { status: 400 });
    }

    const basePath = expandPath(body.path);
    const sitePath = path.join(basePath, body.name);

    const hostname =
      body.hostnameMode === "localhost"
        ? "localhost"
        : body.hostname || `${body.name}.test`;

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
        ...(body.phpMemoryLimit != null && { memoryLimit: body.phpMemoryLimit }),
        ...(body.phpMaxExecutionTime != null && { maxExecutionTime: body.phpMaxExecutionTime }),
        ...(body.phpUploadMaxFilesize != null && { uploadMaxFilesize: body.phpUploadMaxFilesize }),
        ...(body.phpPostMaxSize != null && { postMaxSize: body.phpPostMaxSize }),
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

    // ディレクトリ作成
    await fs.mkdir(sitePath, { recursive: true });
    await fs.mkdir(path.join(sitePath, "src"), { recursive: true });
    await fs.mkdir(path.join(sitePath, "php"), { recursive: true });
    await fs.mkdir(path.join(sitePath, "docker", "wpcli"), { recursive: true });
    const certsPath = path.join(sitePath, "certs");
    await fs.mkdir(certsPath, { recursive: true });

    // WP-CLI 用 Dockerfile 生成
    await fs.writeFile(
      path.join(sitePath, "docker", "wpcli", "Dockerfile"),
      generateWpcliDockerfile()
    );

    // mkcert で証明書を発行（カスタムホスト名モードのみ。失敗しても続行）
    let useMkcert = false;
    if (body.hostnameMode === "custom") {
      try {
        await execFileAsync(
          "mkcert",
          ["-cert-file", "cert.pem", "-key-file", "key.pem", hostname, "localhost", "127.0.0.1"],
          { cwd: certsPath }
        );
        useMkcert = true;
      } catch {
        // mkcert 未インストール時は Caddy の tls internal を使用
      }
    }

    // 各ファイルを書き出す
    await fs.writeFile(
      path.join(sitePath, "docker-compose.yml"),
      generateDockerCompose({ projectName: body.name, port, config })
    );
    await fs.writeFile(
      path.join(sitePath, ".env"),
      generateEnvFile({ projectName: body.name, port, config })
    );
    await fs.writeFile(
      path.join(sitePath, "Caddyfile"),
      generateCaddyfile({ projectName: body.name, port, config, useMkcert })
    );
    await fs.writeFile(
      path.join(sitePath, "php", "custom.ini"),
      generatePhpIni({ projectName: body.name, port, config })
    );

    // サイト情報を登録（ステータスは "creating"）
    const site: Site = {
      id: randomUUID(),
      name: body.name,
      path: sitePath,
      config,
      status: "creating",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await addSite(site);

    // バックグラウンドで WordPress をセットアップ（await しないので POST は先に返る）
    (async () => {
      try {
        await execFileAsync("docker", ["compose", "up", "-d"], { cwd: sitePath });

        const wpConfigReady = await waitForWpConfig(sitePath);
        if (!wpConfigReady) {
          await updateSite(site.id, { status: "error" });
          return;
        }

        const dbReady = await waitForDatabase(sitePath);
        if (!dbReady) {
          await updateSite(site.id, { status: "error" });
          return;
        }

        const installed = await isWordPressInstalled(sitePath);
        if (!installed) {
          const siteUrl =
            body.hostnameMode === "localhost"
              ? `http://localhost:${port}`
              : `https://${hostname}`;

          await execFileAsync(
            "docker",
            [
              "compose", "run", "--rm", "wpcli",
              "core", "install",
              `--url=${siteUrl}`,
              `--title=${body.name}`,
              `--admin_user=${body.wpAdminUser}`,
              `--admin_password=${body.wpAdminPassword}`,
              `--admin_email=${body.wpAdminEmail}`,
              `--locale=${body.wpLocale}`,
              "--skip-plugins",
              "--skip-themes",
            ],
            { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
          );

          // 日本語など en_US 以外の言語パックをインストール・有効化
          if (body.wpLocale && body.wpLocale !== "en_US") {
            try {
              await execFileAsync(
                "docker",
                ["compose", "run", "--rm", "wpcli", "language", "core", "install", body.wpLocale],
                { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
              );
              await execFileAsync(
                "docker",
                ["compose", "run", "--rm", "wpcli", "site", "switch-language", body.wpLocale],
                { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
              );
            } catch (langError) {
              console.warn(`[${body.name}] Language pack installation failed:`, langError);
            }
          }
        }

        await updateSite(site.id, { status: "running" });
      } catch (error) {
        console.error(`[${body.name}] WordPress setup failed:`, error);
        await updateSite(site.id, { status: "error" });
      }
    })();

    // バックグラウンドを待たずに即座に 201 を返す
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

**バックグラウンドセットアップの流れ**

```
POST /api/sites
  ↓ ファイル生成・addSite（status: "creating"）
  ↓ 201 を即座に返す
  ↓（並行して）
  ├─ docker compose up -d
  ├─ wp-config.php 待機（最大 60 秒）
  ├─ DB 待機（最大 30 秒）
  ├─ wp core install
  ├─ language core install（日本語など）
  └─ updateSite(status: "running")
```

**確認**

開発サーバーを起動した状態で curl で POST を送る。

```bash
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-site",
    "hostnameMode": "localhost",
    "path": "~/wp-sites",
    "wpVersion": "latest",
    "phpVersion": "8.3",
    "dbType": "mariadb",
    "dbVersion": "10.6",
    "wpAdminUser": "admin",
    "wpAdminPassword": "adminpass",
    "wpAdminEmail": "admin@example.com",
    "wpLocale": "ja"
  }'
```

- 即座に `201` と `status: "creating"` のサイト情報が返る。
- `~/wp-sites/my-site/` に `docker-compose.yml`・`.env`・`php/custom.ini`・`Caddyfile` などが生成されている。
- `data/sites.json` に 1 件追加されている。
- しばらく待つと `status` が `"running"` に変わる。

---

## 3-3b. Mailpit（開発用メールサーバー）

`generateDockerCompose()` が生成する `docker-compose.yml` には、**Mailpit** サービスが常に含まれる。Mailpit はメール送信をキャプチャするローカル専用 SMTP サーバーで、WordPress から送信されたメールを Web UI で確認できる。

| 項目 | 値 |
|------|-----|
| Mailpit Web UI | `http://localhost:{サイトポート+1000}`（例: ポート 8080 → `http://localhost:9080`） |
| SMTP ホスト | `mailpit`（Docker ネットワーク内） |
| SMTP ポート | `1025` |

WordPress コンテナには `WORDPRESS_SMTP_HOST=mailpit`・`WORDPRESS_SMTP_PORT=1025` が設定済みなので、WP Mail SMTP などのプラグイン不要でメールが届く。

---

## 3-4. 新規サイト作成フォームを作る

**何をするか**
`/sites/new` に shadcn/ui コンポーネントを使ったフォームを置き、**`useDockerVersions` フック**でバージョン選択肢を動的取得し、**POST /api/sites** を呼んでからトップページへリダイレクトする。

**手順**

1. **useDockerVersions フックを作成する**

```bash
mkdir -p src/hooks
touch src/hooks/use-docker-versions.ts
```

`src/hooks/use-docker-versions.ts` に以下を書く。

```typescript
"use client";

import { useState, useEffect } from "react";

interface DockerVersions {
  wordpress: string[];
  mariadb: string[];
  mysql: string[];
  php: string[];
}

const DEFAULT_VERSIONS: DockerVersions = {
  wordpress: ["latest", "6.9", "6.8", "6.7", "6.6", "6.5"],
  mariadb: ["latest", "11.4", "10.11", "10.6", "10.5"],
  mysql: ["latest", "8.4", "8.0", "5.7"],
  php: ["latest", "8.3", "8.2", "8.1", "8.0"],
};

export function useDockerVersions() {
  const [versions, setVersions] = useState<DockerVersions>(DEFAULT_VERSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersions() {
      try {
        const res = await fetch("/api/docker/tags");
        if (!res.ok) throw new Error("Failed to fetch versions");
        const data = await res.json();
        setVersions(data);
      } catch (err) {
        console.error("Failed to fetch Docker versions:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // フォールバック（DEFAULT_VERSIONS）をそのまま使う
      } finally {
        setIsLoading(false);
      }
    }
    fetchVersions();
  }, []);

  return { versions, isLoading, error };
}
```

2. **ページ用ディレクトリを作成**

```bash
mkdir -p src/app/sites/new
```

3. **フォームページを実装**

`src/app/sites/new/page.tsx` を新規作成する（クライアントコンポーネント）。

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDockerVersions } from "@/hooks/use-docker-versions";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z
    .string()
    .min(1, "サイト名を入力してください")
    .regex(/^[a-z0-9-]+$/, "小文字英数字とハイフンのみ使用できます"),
  hostnameMode: z.enum(["localhost", "custom"]),
  hostname: z.string().optional(),
  path: z.string().min(1, "パスを入力してください"),
  port: z
    .number()
    .min(1024, "1024 以上のポートを指定してください")
    .max(65535, "65535 以下のポートを指定してください")
    .optional(),
  wpVersion: z.string(),
  phpVersion: z.string(),
  dbType: z.enum(["mariadb", "mysql"]),
  dbVersion: z.string(),
  wpAdminUser: z.string().min(1, "管理者ユーザー名を入力してください"),
  wpAdminPassword: z.string().min(8, "8 文字以上のパスワードを入力してください"),
  wpAdminEmail: z.string().email("有効なメールアドレスを入力してください"),
  wpLocale: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  hostnameMode: "localhost",
  hostname: "",
  path: "~/wp-sites",
  port: undefined,
  wpVersion: "latest",
  phpVersion: "8.3",
  dbType: "mariadb",
  dbVersion: "10.6",
  wpAdminUser: "admin",
  wpAdminPassword: "",
  wpAdminEmail: "admin@example.com",
  wpLocale: "ja",
};

const dbTypes = [
  { value: "mariadb", label: "MariaDB" },
  { value: "mysql", label: "MySQL" },
];

/** ランダムなパスワードを生成（英数字＋記号） */
function generateRandomPassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

export default function NewSitePage() {
  const router = useRouter();
  const { versions, isLoading: isLoadingVersions } = useDockerVersions();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const watchDbType = form.watch("dbType");
  const dbVersions = watchDbType === "mysql" ? versions.mysql : versions.mariadb;
  const watchDbVersion = form.watch("dbVersion");

  // dbType が変わったとき、dbVersion が新リストに存在しなければ先頭に切り替える
  useEffect(() => {
    if (dbVersions.length > 0 && watchDbVersion && !dbVersions.includes(watchDbVersion)) {
      form.setValue("dbVersion", dbVersions[0], { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDbType, dbVersions]);

  // 初回マウント時にランダムパスワードを生成
  useEffect(() => {
    if (!form.getValues("wpAdminPassword")) {
      form.setValue("wpAdminPassword", generateRandomPassword());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "サイトの作成に失敗しました");
      router.push("/");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">新規サイト作成</h1>
        <p className="text-muted-foreground">WordPress ローカル環境を作成します</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 基本設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">基本設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サイト名</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="my-blog"
                        {...field}
                        onChange={(e) => {
                          const newName = e.target.value;
                          const oldName = form.getValues("name");
                          field.onChange(e);
                          // カスタムホスト名モードのとき、サイト名からホスト名を自動生成
                          if (form.getValues("hostnameMode") === "custom") {
                            const currentHostname = form.getValues("hostname");
                            if (!currentHostname || currentHostname === oldName + ".test") {
                              form.setValue("hostname", newName + ".test");
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>小文字英数字とハイフンのみ（例: my-blog）</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hostnameMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>アクセス方法</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="localhost">localhost:port（簡単・設定不要）</SelectItem>
                        <SelectItem value="custom">カスタムホスト名（要 /etc/hosts）</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === "localhost"
                        ? "http://localhost:8080 のような URL でアクセスします"
                        : "mysite.test のようなカスタムドメインでアクセスします（HTTPS も利用可）"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("hostnameMode") === "custom" && (
                <FormField
                  control={form.control}
                  name="hostname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ホスト名</FormLabel>
                      <FormControl>
                        <Input placeholder="my-blog.test" {...field} />
                      </FormControl>
                      <FormDescription>
                        /etc/hosts に追加するホスト名（例: my-blog.test）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ローカルパス</FormLabel>
                    <FormControl>
                      <Input placeholder="~/wp-sites" {...field} />
                    </FormControl>
                    <FormDescription>
                      サイトファイルの保存先（{field.value}/{form.watch("name") || "サイト名"}）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* 詳細設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                詳細設定
                {isLoadingVersions && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WordPress</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {versions.wordpress.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phpVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PHP</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {versions.php.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : `PHP ${v}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dbType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>データベース</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // DB タイプ変更時にバージョンをリセット
                          const newVersions =
                            value === "mysql" ? versions.mysql : versions.mariadb;
                          if (newVersions.length > 0) {
                            form.setValue("dbVersion", newVersions[0]);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dbTypes.map((v) => (
                            <SelectItem key={v.value} value={v.value}>
                              {v.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dbVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DB バージョン</FormLabel>
                      <Select
                        key={watchDbType}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dbVersions.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* WordPress 初期設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">WordPress 初期設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                サイト作成時に WordPress を自動セットアップします
              </p>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpAdminUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者ユーザー名</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wpAdminPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者パスワード</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="8 文字以上"
                          {...field}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormDescription>自動生成済み。必要に応じて変更可</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpAdminEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者メールアドレス</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="admin@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wpLocale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>言語</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ja">日本語</SelectItem>
                          <SelectItem value="en_US">English (US)</SelectItem>
                          <SelectItem value="en_GB">English (UK)</SelectItem>
                          <SelectItem value="zh_CN">中文 (简体)</SelectItem>
                          <SelectItem value="zh_TW">中文 (繁體)</SelectItem>
                          <SelectItem value="ko_KR">한국어</SelectItem>
                          <SelectItem value="de_DE">Deutsch</SelectItem>
                          <SelectItem value="fr_FR">Français</SelectItem>
                          <SelectItem value="es_ES">Español</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* エラー表示 */}
          {submitError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {submitError}
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isSubmitting ? "作成中..." : "作成"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/")}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
```

4. **トップページから「新規サイト作成」へリンクする**

`src/app/page.tsx` の「サイトがありません」ブロック内に `/sites/new` へのリンクを追加する。

```tsx
<p className="text-sm">
  <a href="/sites/new" className="text-blue-600 hover:underline">新規サイト作成</a> から始めましょう
</p>
```

**確認**

- `http://localhost:3000/sites/new` を開き、サイト名・管理者情報を入力して「作成」を押す。
- 作成後トップに戻り、新しいサイトのカードが 1 枚表示される（ステータスは `creating`）。
- しばらく待つとステータスが `running` に変わる。
- 指定した path（例: `~/wp-sites/my-site`）に `docker-compose.yml`・`.env`・`php/custom.ini`・`Caddyfile` などが生成されている。

---

## Step 3 のまとめと確認

- [ ] `lib/docker-compose.ts` で docker-compose.yml（Caddy・Mailpit・WP-CLI・Composer 含む）・.env・php.ini・Caddyfile・wpcli Dockerfile を生成できる
- [ ] `POST /api/sites` でバリデーション・ディレクトリ作成・ファイル生成・addSite（status: "creating"）が行われ、201 でサイトが返る
- [ ] バックグラウンドでコンテナ起動 → WordPress インストール → status: "running" へ更新される
- [ ] `/sites/new` のフォーム（shadcn/ui）から送信するとサイトが作成され、トップに戻って一覧に表示される
- [ ] `useDockerVersions` フックでバージョン選択肢を動的取得している
- [ ] （オプション）`hostnameMode: "custom"` のとき `Caddyfile` が生成され、mkcert があれば `certs/` に証明書が置かれる

**ここまでで Step 3 は完了です。**
次は [Step 4：起動・停止 API と実際のコンテナ状態の反映](step-04-start-stop.md) に進んでください。
