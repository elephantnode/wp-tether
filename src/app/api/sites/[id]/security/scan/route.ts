import { NextRequest, NextResponse } from "next/server";
import { getSite } from "@/lib/sites";
import { runSecurityScan } from "@/lib/security-scan";
import { getCachedScan, setCachedScan } from "@/lib/security-cache";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sites/[id]/security/scan
 * - refresh=0: 前回のスキャン結果（キャッシュ）があれば返す。なければ noCachedResult を返す（新規スキャンは行わない）
 * - refresh=1: 強制再スキャンし、結果をキャッシュに保存して返す
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
    }

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";

    if (!refresh) {
      const cached = await getCachedScan(id);
      if (cached) {
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cachedAt: cached.scannedAt,
        });
      }
      // キャッシュなし = まだ一度もスキャンしていない → スキャンは行わず、フロントで「スキャン実行」を促す
      return NextResponse.json({
        noCachedResult: true,
        message: "スキャン結果がありません。再スキャンをクリックして実行してください。",
      });
    }

    const siteRunning = site.status === "running";

    // サイトURLを構築
    let siteUrl: string | undefined;
    if (site.config.hostnameMode === "localhost") {
      siteUrl = `http://localhost:${site.config.port}`;
    } else {
      siteUrl = `http://${site.config.hostname}`;
    }

    const result = await runSecurityScan(site.path, siteRunning, siteUrl);
    await setCachedScan(id, result);

    return NextResponse.json({
      ...result,
      fromCache: false,
      cachedAt: result.scannedAt,
    });
  } catch (error) {
    console.error("Security scan failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "スキャンに失敗しました" },
      { status: 500 }
    );
  }
}
