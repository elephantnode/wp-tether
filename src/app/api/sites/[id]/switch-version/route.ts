import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite, updateSite } from "@/lib/sites";
import {
  generateDockerCompose,
  generatePhpIni,
} from "@/lib/docker-compose";

const execFileAsync = promisify(execFile);

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/switch-version
 * body: { phpVersion?: string; wordpressVersion?: string }
 *
 * 1. サイト設定を更新
 * 2. docker-compose.yml / php.ini を再生成
 * 3. docker compose pull（新イメージ取得）
 * 4. docker compose up -d（コンテナ差し替え）
 * DB ボリュームはそのまま保持されるためデータは消えない。
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) {
    return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
  }

  const body = await request.json() as { phpVersion?: string; wordpressVersion?: string };
  const { phpVersion, wordpressVersion } = body;

  if (!phpVersion && !wordpressVersion) {
    return NextResponse.json({ error: "phpVersion または wordpressVersion を指定してください" }, { status: 400 });
  }

  const logs: string[] = [];

  try {
    // 1. 設定を更新
    const newConfig = {
      ...site.config,
      php: phpVersion ? { ...site.config.php, version: phpVersion } : site.config.php,
      wordpress: wordpressVersion
        ? { ...site.config.wordpress, version: wordpressVersion }
        : site.config.wordpress,
    };

    await updateSite(id, { config: newConfig });
    logs.push(`設定を更新しました（WP: ${newConfig.wordpress.version} / PHP: ${newConfig.php.version}）`);

    // 2. docker-compose.yml を再生成
    const sitePath = site.path;
    const generateOpts = {
      projectName: newConfig.projectName,
      port: newConfig.port,
      config: newConfig,
    };
    const composeContent = generateDockerCompose(generateOpts);
    await fs.writeFile(path.join(sitePath, "docker-compose.yml"), composeContent);
    logs.push("docker-compose.yml を再生成しました");

    // php/custom.ini も再生成
    const phpIniContent = generatePhpIni(generateOpts);
    await fs.mkdir(path.join(sitePath, "php"), { recursive: true });
    await fs.writeFile(path.join(sitePath, "php", "custom.ini"), phpIniContent);
    logs.push("php/custom.ini を再生成しました");

    // 3. 新しいイメージを pull
    logs.push("新しい Docker イメージを取得中...");
    const { stdout: pullOut, stderr: pullErr } = await execFileAsync(
      "docker",
      ["compose", "pull", "wordpress"],
      { cwd: sitePath, timeout: 300000 }
    );
    logs.push((pullOut + pullErr).trim() || "pull 完了");

    // 4. コンテナを再起動（up -d で差し替え）
    logs.push("コンテナを再起動中...");
    const { stdout: upOut, stderr: upErr } = await execFileAsync(
      "docker",
      ["compose", "up", "-d"],
      { cwd: sitePath, timeout: 120000 }
    );
    logs.push((upOut + upErr).trim() || "起動完了");

    await updateSite(id, { status: "running" });

    return NextResponse.json({
      success: true,
      phpVersion: newConfig.php.version,
      wordpressVersion: newConfig.wordpress.version,
      output: logs.join("\n"),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logs.push(`[エラー] ${msg}`);
    return NextResponse.json(
      { success: false, error: msg, output: logs.join("\n") },
      { status: 500 }
    );
  }
}
