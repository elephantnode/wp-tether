import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";

export interface DbBackup {
  filename: string;
  createdAt: string;
  size: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    const backupDir = path.join(site.path, "backups", "db");

    let backups: DbBackup[] = [];

    try {
      const files = await fs.readdir(backupDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));

      for (const filename of sqlFiles) {
        const filePath = path.join(backupDir, filename);
        const stat = await fs.stat(filePath);
        backups.push({
          filename,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
        });
      }

      // 新しい順にソート
      backups.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      // バックアップディレクトリが存在しない場合は空配列
    }

    return NextResponse.json({ backups });
  } catch (error) {
    console.error("Failed to get backups:", error);
    return NextResponse.json(
      { error: "バックアップ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}
