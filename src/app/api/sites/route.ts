import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { Site, SiteConfig } from "@/types";
import { getSites, addSite, expandPath } from "@/lib/sites";
import { generateDockerCompose, generateEnvFile, generateCaddyfile, generatePhpIni } from "@/lib/docker-compose";

const execFileAsync = promisify(execFile);

interface CreateSiteRequest {
  name: string;
  hostname: string;
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
}

/**
 * GET /api/sites - サイト一覧を取得
 */
export async function GET() {
  try {
    const sites = await getSites();
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

    // サイト設定を作成
    const config: SiteConfig = {
      projectName: body.name,
      hostname: body.hostname,
      suffix: "local",
      timezone: "Asia/Tokyo",
      port: port,
      wordpress: {
        version: body.wpVersion,
        debug: true,
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
    const certsPath = path.join(sitePath, "certs");
    await fs.mkdir(certsPath, { recursive: true });

    // mkcertで証明書を発行（インストールされていればブラウザでSSL警告が出ない）
    let useMkcert = false;
    try {
      await execFileAsync(
        "mkcert",
        ["-cert-file", "cert.pem", "-key-file", "key.pem", body.hostname, "localhost", "127.0.0.1"],
        { cwd: certsPath }
      );
      useMkcert = true;
    } catch {
      // mkcertが未インストールまたは失敗時は Caddy の tls internal を使用
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
      status: "stopped",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存
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
