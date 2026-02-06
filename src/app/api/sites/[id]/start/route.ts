import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite, updateSite } from "@/lib/sites";
import { generatePhpIni } from "@/lib/docker-compose";

const execAsync = promisify(exec);

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/start - サイトを起動
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // php/custom.ini が無いとマウントでディレクトリが作られ PHP が起動しないため、なければ作成
    const phpDir = path.join(site.path, "php");
    const customIniPath = path.join(phpDir, "custom.ini");
    try {
      await fs.access(customIniPath);
    } catch {
      await fs.mkdir(phpDir, { recursive: true });
      const phpIni = generatePhpIni({
        projectName: site.config.projectName,
        port: site.config.port,
        config: site.config,
      });
      await fs.writeFile(customIniPath, phpIni);
    }

    // docker compose up -d を実行
    await execAsync("docker compose up -d", {
      cwd: site.path,
    });

    // ステータスを更新
    await updateSite(id, { status: "running" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to start site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "起動に失敗しました" },
      { status: 500 }
    );
  }
}
