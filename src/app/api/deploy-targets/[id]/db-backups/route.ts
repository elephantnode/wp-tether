import { NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { listRemoteBackups, getRemoteBackupDir } from "@/lib/db-sync";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);

    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    const backups = await listRemoteBackups(target);
    const backupDir = await getRemoteBackupDir(target);

    return NextResponse.json({ backups, backupDir });
  } catch (error) {
    console.error("Failed to list remote backups:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `バックアップ一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
