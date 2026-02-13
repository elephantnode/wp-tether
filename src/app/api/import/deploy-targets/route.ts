import { NextResponse } from "next/server";
import { getDeployTargets, saveDeployTargets } from "@/lib/deploy-targets";
import { DeployTarget } from "@/types";

interface ImportData {
  exportedAt?: string;
  version?: string;
  type?: string;
  data: DeployTarget[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode = "merge" } = body as { importData: ImportData; mode?: "merge" | "replace" };

    // importDataが直接渡された場合とbody.importDataの両方に対応
    const importData: ImportData = body.importData || body;

    if (!importData.data || !Array.isArray(importData.data)) {
      return NextResponse.json(
        { error: "無効なインポートデータです" },
        { status: 400 }
      );
    }

    // 型チェック（簡易）
    if (importData.type && importData.type !== "deploy-targets") {
      return NextResponse.json(
        { error: "デプロイターゲットデータではありません" },
        { status: 400 }
      );
    }

    const importedTargets = importData.data;
    let resultTargets: DeployTarget[];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === "replace") {
      // 上書きモード: 既存データを完全に置き換え
      resultTargets = importedTargets;
      added = importedTargets.length;
    } else {
      // マージモード: 同じIDがあれば更新、なければ追加
      const existingTargets = await getDeployTargets();
      const existingMap = new Map(existingTargets.map((t) => [t.id, t]));

      for (const target of importedTargets) {
        if (existingMap.has(target.id)) {
          existingMap.set(target.id, target);
          updated++;
        } else {
          existingMap.set(target.id, target);
          added++;
        }
      }

      resultTargets = Array.from(existingMap.values());
    }

    await saveDeployTargets(resultTargets);

    return NextResponse.json({
      success: true,
      message: `インポート完了: ${added}件追加, ${updated}件更新`,
      stats: { added, updated, skipped, total: resultTargets.length },
    });
  } catch (error) {
    console.error("Failed to import deploy targets:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `インポートに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
