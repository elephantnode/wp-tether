import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";

const execAsync = promisify(exec);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { error: "filename は必須です" },
        { status: 400 }
      );
    }

    const site = await getSite(id);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    if (site.status !== "running") {
      return NextResponse.json(
        { error: "サイトが稼働していません。起動してから実行してください。" },
        { status: 400 }
      );
    }

    // バックアップファイルの存在確認
    const backupPath = path.join(site.path, "backups", "db", filename);
    try {
      await fs.access(backupPath);
    } catch {
      return NextResponse.json(
        { error: "バックアップファイルが見つかりません" },
        { status: 404 }
      );
    }

    // wp-contentにコピー
    const tempPath = path.join(site.path, "src", "wp-content", "db-restore.sql");
    await fs.copyFile(backupPath, tempPath);

    try {
      // WP-CLIでインポート
      const projectName = site.config.projectName;
      const command = `docker compose -p ${projectName} run --rm wpcli db import /var/www/html/wp-content/db-restore.sql`;

      const { stdout, stderr } = await execAsync(command, {
        cwd: site.path,
        timeout: 300000, // 5分
      });

      return NextResponse.json({
        success: true,
        filename,
        output: stdout,
        stderr: stderr || undefined,
      });
    } finally {
      // 一時ファイルを削除
      try {
        await fs.unlink(tempPath);
      } catch {
        // 削除失敗は無視
      }
    }
  } catch (error) {
    console.error("Failed to restore backup:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `復元に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
