import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { checkServerHealth, saveHealthResult, getCachedHealth } from "@/lib/server-monitor";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/[id]/health - キャッシュ済みヘルス結果を取得
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const health = await getCachedHealth(id);
  if (!health) {
    return NextResponse.json({ health: null });
  }
  return NextResponse.json({ health });
}

/**
 * POST /api/servers/[id]/health - ヘルスチェックを即時実行して保存
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target) {
      return NextResponse.json({ error: "サーバーが見つかりません" }, { status: 404 });
    }
    if (target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーのみ対応しています" }, { status: 400 });
    }

    const health = await checkServerHealth(target);
    await saveHealthResult(health);

    return NextResponse.json({ health });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ error: "ヘルスチェックに失敗しました" }, { status: 500 });
  }
}
