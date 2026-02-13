import { NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { restoreRemoteBackup } from "@/lib/db-sync";

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

    const target = await getDeployTarget(id);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    const result = await restoreRemoteBackup(target, filename);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, output: result.output },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filename,
      output: result.output,
    });
  } catch (error) {
    console.error("Failed to restore remote backup:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `復元に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
