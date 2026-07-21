import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";
import { executeDbSync, detectRemoteCapabilities } from "@/lib/db-sync";
import { DbSyncOptions } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      targetId,
      direction,
      includeUsers = false,
      createBackup = true,
      dryRun = false,
    } = body;

    if (!targetId) {
      return NextResponse.json(
        { error: "targetId は必須です" },
        { status: 400 }
      );
    }

    if (!direction || !["push", "pull"].includes(direction)) {
      return NextResponse.json(
        { error: "direction は push または pull を指定してください" },
        { status: 400 }
      );
    }

    // ターゲットを取得
    const target = await getDeployTarget(targetId);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    // 保守専用サーバー（サイト未紐付け）ではDB同期は行えない
    if (!target.siteId) {
      return NextResponse.json(
        { error: "このサーバーはローカルサイトに紐付いていないため、DB同期は利用できません。" },
        { status: 400 }
      );
    }

    // サイトを取得
    const site = await getSite(target.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // サイトが起動していない場合はエラー
    if (site.status !== "running") {
      return NextResponse.json(
        { error: "サイトが起動していません。先にサイトを起動してください。" },
        { status: 400 }
      );
    }

    // SSH設定の確認
    if (!target.ssh) {
      return NextResponse.json(
        { error: "SSH設定がありません" },
        { status: 400 }
      );
    }

    const options: DbSyncOptions = {
      direction,
      includeUsers,
      createBackup,
      dryRun,
    };

    const result = await executeDbSync(site, target, options);

    return NextResponse.json(result);

  } catch (error) {
    console.error("DB sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "DB同期中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}

/**
 * GET: リモートサーバーの能力を検出
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get("targetId");

    if (!targetId) {
      return NextResponse.json(
        { error: "targetId は必須です" },
        { status: 400 }
      );
    }

    const target = await getDeployTarget(targetId);
    if (!target) {
      return NextResponse.json(
        { error: "デプロイターゲットが見つかりません" },
        { status: 404 }
      );
    }

    if (!target.ssh) {
      return NextResponse.json(
        { error: "SSH設定がありません" },
        { status: 400 }
      );
    }

    const capabilities = await detectRemoteCapabilities(target);

    return NextResponse.json({ capabilities });

  } catch (error) {
    console.error("Capability detection error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "能力検出中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
