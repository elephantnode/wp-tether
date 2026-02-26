import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getAppConfig, saveAppConfig, expandConfigPath, resolveSitesJsonPath } from "@/lib/app-config";

export async function GET() {
  const config = await getAppConfig();
  const resolvedSitesJsonPath = await resolveSitesJsonPath();
  return NextResponse.json({ ...config, resolvedSitesJsonPath });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sitesJsonPath } = body;

    if (typeof sitesJsonPath !== "string") {
      return NextResponse.json({ error: "sitesJsonPath は文字列で指定してください" }, { status: 400 });
    }

    // パスが指定されている場合のみ検証
    if (sitesJsonPath) {
      const resolved = expandConfigPath(sitesJsonPath);
      // 絶対パスであること、または ~/で始まることを確認
      if (!path.isAbsolute(resolved)) {
        return NextResponse.json(
          { error: "絶対パスまたは ~/... 形式で指定してください" },
          { status: 400 }
        );
      }
      // .json で終わることを確認
      if (!resolved.endsWith(".json")) {
        return NextResponse.json(
          { error: "ファイルパスは .json で終わる必要があります" },
          { status: 400 }
        );
      }
    }

    const updated = await saveAppConfig({ sitesJsonPath });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "設定の保存に失敗しました" },
      { status: 500 }
    );
  }
}
