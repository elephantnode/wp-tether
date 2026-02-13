import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";
import { testSSHConnection, validateRemotePath } from "@/lib/sync";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/deploy-targets/[id]/test - 接続テスト
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);

    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    // サイトの取得
    const site = await getSite(target.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // SSH接続のみサポート（現時点）
    if (target.type !== "ssh") {
      return NextResponse.json(
        { error: "現在SSH接続のみサポートしています" },
        { status: 400 }
      );
    }

    // SSH接続テスト
    const connectionResult = await testSSHConnection(site.path, target);
    if (!connectionResult.success) {
      return NextResponse.json({
        success: false,
        step: "connection",
        error: connectionResult.error,
      });
    }

    // リモートパス検証
    const pathResult = await validateRemotePath(site.path, target);
    if (!pathResult.success) {
      return NextResponse.json({
        success: false,
        step: "path",
        error: pathResult.error,
      });
    }

    return NextResponse.json({
      success: true,
      message: "接続テスト成功",
    });
  } catch (error) {
    console.error("Connection test failed:", error);
    return NextResponse.json(
      { error: "接続テストに失敗しました" },
      { status: 500 }
    );
  }
}
