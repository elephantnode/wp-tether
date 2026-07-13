import { NextResponse } from "next/server";
import { getDeployTargets, saveDeployTargets } from "@/lib/deploy-targets";
import { getSites } from "@/lib/sites";

export async function POST() {
  try {
    const sites = await getSites();
    const targets = await getDeployTargets();

    // 有効なサイトIDのセットを作成
    const validSiteIds = new Set(sites.map((s) => s.id));

    // 孤児ターゲット（存在しないサイトに紐づくもの）を除外
    // siteId 未設定（保守専用サーバー）は孤児扱いしない
    const validTargets = targets.filter((t) => !t.siteId || validSiteIds.has(t.siteId));
    const orphanCount = targets.length - validTargets.length;

    if (orphanCount > 0) {
      await saveDeployTargets(validTargets);
    }

    return NextResponse.json({
      success: true,
      message: orphanCount > 0
        ? `${orphanCount}件の孤児データを削除しました`
        : "孤児データはありませんでした",
      stats: {
        before: targets.length,
        after: validTargets.length,
        removed: orphanCount,
      },
    });
  } catch (error) {
    console.error("Failed to cleanup orphan targets:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `クリーンアップに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
