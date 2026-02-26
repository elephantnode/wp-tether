import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
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

    const { migrate } = body;

    // パス変更前に現在のデータを読み込む
    const currentPath = await resolveSitesJsonPath();
    let existingContent: string | null = null;
    try {
      existingContent = await fs.readFile(currentPath, "utf-8");
    } catch {
      // 現在のファイルが存在しない場合は無視
    }

    const updated = await saveAppConfig({ sitesJsonPath });

    // migrate=true かつ新しいパスが指定されていて、そのファイルが存在しない場合にデータをコピー
    if (migrate && sitesJsonPath && existingContent) {
      const newResolved = expandConfigPath(sitesJsonPath);
      let newFileExists = false;
      try {
        await fs.access(newResolved);
        newFileExists = true;
      } catch {
        // ファイルが存在しない
      }

      if (!newFileExists) {
        await fs.mkdir(path.dirname(newResolved), { recursive: true });
        await fs.writeFile(newResolved, existingContent, "utf-8");
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "設定の保存に失敗しました" },
      { status: 500 }
    );
  }
}
