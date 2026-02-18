import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site, SiteConfig } from "@/types";
import { getSites, getSitesWithActualStatus, addSite, updateSite, expandPath } from "@/lib/sites";
import { generateDockerCompose, generateEnvFile, generateCaddyfile, generatePhpIni, generateWpcliDockerfile } from "@/lib/docker-compose";

const execFileAsync = promisify(execFile);

interface CreateSiteRequest {
  name: string;
  hostnameMode: "localhost" | "custom";
  hostname?: string; // カスタムモード時のみ必須
  path: string;
  port?: number; // オプショナル: 指定されない場合は自動生成
  template: string;
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
  /** WordPress初期設定 */
  wpAdminUser: string;
  wpAdminPassword: string;
  wpAdminEmail: string;
  wpLocale: string;
}

/** wpcli 実行時のタイムアウト（初回はイメージビルドで長くかかることがある） */
const WPCLI_TIMEOUT_MS = 120_000;

/**
 * wp-config.php の生成を待つ（WordPress コンテナが DB 接続情報を書き込むまで待機）
 * wpcli は wp-config がないと DB に接続できないため、先にこれを待つ。
 */
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

/**
 * DBの準備完了を待つ（最大30秒）
 */
async function waitForDatabase(sitePath: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["compose", "run", "--rm", "wpcli", "db", "check"],
        { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
      );
      if (stdout.includes("Success") || !stdout.includes("Error")) {
        return true;
      }
    } catch {
      // まだ準備中
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * WordPressのインストール状態を確認
 */
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

/**
 * GET /api/sites - サイト一覧を取得（実際のコンテナ状態を反映）
 */
export async function GET() {
  try {
    const sites = await getSitesWithActualStatus();
    return NextResponse.json({ sites });
  } catch (error) {
    console.error("Failed to get sites:", error);
    return NextResponse.json(
      { error: "Failed to get sites" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sites - 新規サイトを作成
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateSiteRequest = await request.json();

    // バリデーション
    if (!body.name || !body.path) {
      return NextResponse.json(
        { error: "name, path are required" },
        { status: 400 }
      );
    }

    // 既存サイトとの重複チェック
    const existingSites = await getSites();
    if (existingSites.some((s) => s.name === body.name)) {
      return NextResponse.json(
        { error: "サイト名が既に存在します" },
        { status: 400 }
      );
    }

    // ポート番号の自動生成（指定されない場合）
    // WordPressサイトの識別用ポート（デフォルト8080から開始）
    let port: number;
    if (body.port && typeof body.port === 'number' && body.port > 0) {
      port = body.port;
    } else {
      const WORDPRESS_BASE_PORT = 8080;
      const usedPorts = existingSites.map((s) => s.config.port).filter((p) => p >= WORDPRESS_BASE_PORT);
      port = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : WORDPRESS_BASE_PORT;
    }

    // ポート番号の重複チェック
    if (existingSites.some((s) => s.config.port === port)) {
      return NextResponse.json(
        { error: "ポート番号が既に使用されています" },
        { status: 400 }
      );
    }

    // パスを展開
    const basePath = expandPath(body.path);
    const sitePath = path.join(basePath, body.name);

    // ホスト名を決定（localhostモードの場合はlocalhost、カスタムモードの場合は指定されたホスト名）
    const hostname = body.hostnameMode === "localhost"
      ? "localhost"
      : (body.hostname || `${body.name}.test`);

    // サイト設定を作成
    const config: SiteConfig = {
      projectName: body.name,
      hostname,
      hostnameMode: body.hostnameMode,
      suffix: "local",
      timezone: "Asia/Tokyo",
      port: port,
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

    // WP-CLI用Dockerfile生成（rsync/ssh付き）
    const wpcliDockerfile = generateWpcliDockerfile();
    await fs.writeFile(path.join(sitePath, "docker", "wpcli", "Dockerfile"), wpcliDockerfile);

    // mkcertで証明書を発行（カスタムホスト名モードのみ）
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
        // mkcertが未インストールまたは失敗時は Caddy の tls internal を使用
      }
    }

    // docker-compose.yml生成
    const dockerCompose = generateDockerCompose({
      projectName: body.name,
      port: port,
      config,
    });
    await fs.writeFile(
      path.join(sitePath, "docker-compose.yml"),
      dockerCompose
    );

    // .env生成
    const envFile = generateEnvFile({
      projectName: body.name,
      port: port,
      config,
    });
    await fs.writeFile(path.join(sitePath, ".env"), envFile);

    // Caddyfile生成（mkcert成功時はその証明書を参照）
    const caddyfile = generateCaddyfile({
      projectName: body.name,
      port: port,
      config,
      useMkcert,
    });
    await fs.writeFile(path.join(sitePath, "Caddyfile"), caddyfile);

    // php.ini カスタム設定（メモリ・言語・タイムゾーンなど）
    const phpIni = generatePhpIni({ projectName: body.name, port, config });
    await fs.writeFile(path.join(sitePath, "php", "custom.ini"), phpIni);

    // サイト情報を作成
    const site: Site = {
      id: randomUUID(),
      name: body.name,
      path: sitePath,
      config,
      status: "creating",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存
    await addSite(site);

    // バックグラウンドでWordPressをセットアップ（言語・管理者アカウント含む）
    (async () => {
      try {
        // コンテナを起動
        await execFileAsync("docker", ["compose", "up", "-d"], { cwd: sitePath });

        // 1) wp-config.php ができるまで待つ（WordPress コンテナが DB 接続後に生成）
        const wpConfigReady = await waitForWpConfig(sitePath);
        if (!wpConfigReady) {
          console.error(`[${body.name}] wp-config.php was not created in time`);
          await updateSite(site.id, { status: "error" });
          return;
        }

        // 2) DB の準備完了を待つ
        const dbReady = await waitForDatabase(sitePath);
        if (!dbReady) {
          console.error(`[${body.name}] Database did not become ready in time`);
          await updateSite(site.id, { status: "error" });
          return;
        }

        // 3) WordPress がまだインストールされていなければインストール（管理者・言語を設定）
        const installed = await isWordPressInstalled(sitePath);
        if (!installed) {
          const siteUrl = body.hostnameMode === "localhost"
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
          console.log(`[${body.name}] WordPress installed successfully`);

          // 言語パックをインストール・有効化（en_US 以外の場合）
          if (body.wpLocale && body.wpLocale !== "en_US") {
            try {
              await execFileAsync(
                "docker",
                [
                  "compose", "run", "--rm", "wpcli",
                  "language", "core", "install", body.wpLocale,
                ],
                { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
              );
              await execFileAsync(
                "docker",
                [
                  "compose", "run", "--rm", "wpcli",
                  "site", "switch-language", body.wpLocale,
                ],
                { cwd: sitePath, timeout: WPCLI_TIMEOUT_MS }
              );
              console.log(`[${body.name}] Language pack (${body.wpLocale}) installed`);
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

    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error("Failed to create site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create site" },
      { status: 500 }
    );
  }
}
