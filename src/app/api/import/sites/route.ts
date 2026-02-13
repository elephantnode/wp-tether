import { NextResponse } from "next/server";
import { getSites, saveSites } from "@/lib/sites";
import { Site } from "@/types";

interface ImportData {
  exportedAt?: string;
  version?: string;
  type?: string;
  data: Site[];
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
    if (importData.type && importData.type !== "sites") {
      return NextResponse.json(
        { error: "サイトデータではありません" },
        { status: 400 }
      );
    }

    const importedSites = importData.data;
    let resultSites: Site[];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === "replace") {
      // 上書きモード: 既存データを完全に置き換え
      resultSites = importedSites;
      added = importedSites.length;
    } else {
      // マージモード: 同じIDがあれば更新、なければ追加
      const existingSites = await getSites();
      const existingMap = new Map(existingSites.map((s) => [s.id, s]));

      for (const site of importedSites) {
        if (existingMap.has(site.id)) {
          existingMap.set(site.id, site);
          updated++;
        } else {
          existingMap.set(site.id, site);
          added++;
        }
      }

      resultSites = Array.from(existingMap.values());
    }

    await saveSites(resultSites);

    return NextResponse.json({
      success: true,
      message: `インポート完了: ${added}件追加, ${updated}件更新`,
      stats: { added, updated, skipped, total: resultSites.length },
    });
  } catch (error) {
    console.error("Failed to import sites:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `インポートに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
