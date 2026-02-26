import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  getAppConfig,
  saveAppConfig,
  expandConfigPath,
  resolveDataDir,
  resolveSitesJsonPath,
  resolveDeployTargetsJsonPath,
  resolvePluginPresetsJsonPath,
} from "@/lib/app-config";

export async function GET() {
  const config = await getAppConfig();
  const resolvedDataDir = await resolveDataDir();
  return NextResponse.json({
    ...config,
    resolvedDataDir,
    resolvedSitesJsonPath: path.join(resolvedDataDir, "sites.json"),
    resolvedDeployTargetsJsonPath: path.join(resolvedDataDir, "deploy-targets.json"),
    resolvedPluginPresetsJsonPath: path.join(resolvedDataDir, "plugin-presets.json"),
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataDir, migrate } = body;

    if (typeof dataDir !== "string") {
      return NextResponse.json({ error: "dataDir は文字列で指定してください" }, { status: 400 });
    }

    // パスが指定されている場合のみ検証
    if (dataDir) {
      const resolved = expandConfigPath(dataDir);
      if (!path.isAbsolute(resolved)) {
        return NextResponse.json(
          { error: "絶対パスまたは ~/... 形式で指定してください" },
          { status: 400 }
        );
      }
    }

    // 変更前に現在の各ファイルの内容を読み込む
    const [sitesContent, targetsContent, presetsContent] = await Promise.all([
      fs.readFile(await resolveSitesJsonPath(), "utf-8").catch(() => null),
      fs.readFile(await resolveDeployTargetsJsonPath(), "utf-8").catch(() => null),
      fs.readFile(await resolvePluginPresetsJsonPath(), "utf-8").catch(() => null),
    ]);

    const updated = await saveAppConfig({ dataDir });

    // migrate=true の場合、新しいディレクトリに存在しないファイルをコピー
    if (migrate && dataDir) {
      const newDir = expandConfigPath(dataDir);
      await fs.mkdir(newDir, { recursive: true });

      const filesToMigrate = [
        { name: "sites.json", content: sitesContent },
        { name: "deploy-targets.json", content: targetsContent },
        { name: "plugin-presets.json", content: presetsContent },
      ];

      for (const { name, content } of filesToMigrate) {
        if (!content) continue;
        const dest = path.join(newDir, name);
        const exists = await fs.access(dest).then(() => true).catch(() => false);
        if (!exists) {
          await fs.writeFile(dest, content, "utf-8");
        }
      }
    }

    const resolvedDataDir = expandConfigPath(dataDir) || path.join(process.cwd(), "data");
    return NextResponse.json({
      ...updated,
      resolvedDataDir,
      resolvedSitesJsonPath: path.join(resolvedDataDir, "sites.json"),
      resolvedDeployTargetsJsonPath: path.join(resolvedDataDir, "deploy-targets.json"),
      resolvedPluginPresetsJsonPath: path.join(resolvedDataDir, "plugin-presets.json"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "設定の保存に失敗しました" },
      { status: 500 }
    );
  }
}
