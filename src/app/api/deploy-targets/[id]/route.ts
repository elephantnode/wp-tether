import { NextRequest, NextResponse } from "next/server";
import { DeployTarget } from "@/types";
import {
  getDeployTarget,
  updateDeployTarget,
  deleteDeployTarget,
} from "@/lib/deploy-targets";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/deploy-targets/[id] - デプロイターゲットを取得
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);

    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("Failed to get deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの取得に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/deploy-targets/[id] - デプロイターゲットを更新
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: Partial<DeployTarget> = await request.json();

    // IDとsiteIdは更新不可
    delete body.id;
    delete body.siteId;

    const target = await updateDeployTarget(id, body);

    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("Failed to update deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの更新に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/deploy-targets/[id] - デプロイターゲットを削除
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteDeployTarget(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの削除に失敗しました" },
      { status: 500 }
    );
  }
}
