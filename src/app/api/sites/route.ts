import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Site, SiteConfig } from "@/types";
import { getSites, addSite, expandPath } from "@/lib/sites";
import { generateDockerCompose, generateEnvFile, generateCaddyfile } from "@/lib/docker-compose";

interface CreateSiteRequest {
  name: string;
  hostname: string;
  path: string;
  port: number;
  template: string;
  wpVersion: string;
  phpVersion: string;
  dbType: "mariadb" | "mysql";
  dbVersion: string;
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
    if (!body.name || !body.path || !body.port) {
      return NextResponse.json(
        { error: "name, path, port are required" },
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
    if (existingSites.some((s) => s.config.port === body.port)) {
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
      port: body.port,
      wordpress: {
        version: body.wpVersion,
        debug: true,
      },
      php: {
        version: body.phpVersion,
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

    // docker-compose.yml生成
    const dockerCompose = generateDockerCompose({
      projectName: body.name,
      port: body.port,
      config,
    });
    await fs.writeFile(
      path.join(sitePath, "docker-compose.yml"),
      dockerCompose
    );

    // .env生成
    const envFile = generateEnvFile({
      projectName: body.name,
      port: body.port,
      config,
    });
    await fs.writeFile(path.join(sitePath, ".env"), envFile);

    // Caddyfile生成
    const caddyfile = generateCaddyfile({
      projectName: body.name,
      port: body.port,
      config,
    });
    await fs.writeFile(path.join(sitePath, "Caddyfile"), caddyfile);

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
