import { NextRequest, NextResponse } from "next/server";
import { DeployDirection, DeployScope } from "@/types";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";
import { executeSync } from "@/lib/sync";

interface SyncRequest {
  targetId: string;
  direction: DeployDirection;
  scopes: DeployScope[];
  dryRun?: boolean;
}

/**
 * POST /api/sync - 同期を実行
 */
export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json();

    // バリデーション
    if (!body.targetId || !body.direction || !body.scopes || body.scopes.length === 0) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    // デプロイターゲットの取得
    const target = await getDeployTarget(body.targetId);
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

    // SSH接続のみサポート
    if (target.type !== "ssh") {
      return NextResponse.json(
        { error: "現在SSH接続のみサポートしています" },
        { status: 400 }
      );
    }

    // DBスコープは現在未サポート
    if (body.scopes.includes("db")) {
      return NextResponse.json(
        { error: "データベース同期は現在未サポートです" },
        { status: 400 }
      );
    }

    // 同期実行
    const results = await executeSync({
      sitePath: site.path,
      target,
      direction: body.direction,
      scopes: body.scopes,
      dryRun: body.dryRun ?? false,
    });

    // 結果をまとめる
    const allSuccess = results.every((r) => r.success);
    const totalOutput = results.map((r) => {
      if (r.success) {
        return `=== ${r.scope} ===\n${r.output}`;
      } else {
        return `=== ${r.scope} (エラー) ===\n${r.error}`;
      }
    }).join("\n\n");

    return NextResponse.json({
      success: allSuccess,
      results,
      output: totalOutput,
      dryRun: body.dryRun ?? false,
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同期に失敗しました" },
      { status: 500 }
    );
  }
}
