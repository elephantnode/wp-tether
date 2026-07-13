import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  getAppConfig,
  saveAppConfig,
  expandConfigPath,
  resolveDataDir,
  resolveBackupDir,
  resolveSitesJsonPath,
  resolveDeployTargetsJsonPath,
  resolvePluginPresetsJsonPath,
  DEFAULT_NOTIFY_CONFIG,
} from "@/lib/app-config";

export async function GET() {
  const config = await getAppConfig();
  const resolvedDataDir = await resolveDataDir();
  const resolvedBackupDir = await resolveBackupDir();
  return NextResponse.json({
    ...config,
    resolvedDataDir,
    resolvedBackupDir,
    resolvedSitesJsonPath: path.join(resolvedDataDir, "sites.json"),
    resolvedDeployTargetsJsonPath: path.join(resolvedDataDir, "deploy-targets.json"),
    resolvedPluginPresetsJsonPath: path.join(resolvedDataDir, "plugin-presets.json"),
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataDir, migrate, terminalApp, editorApp } = body;

    const patch: Record<string, unknown> = {};

    // dataDir の更新
    if (dataDir !== undefined) {
      if (typeof dataDir !== "string") {
        return NextResponse.json({ error: "dataDir は文字列で指定してください" }, { status: 400 });
      }
      if (dataDir) {
        const resolved = expandConfigPath(dataDir);
        if (!path.isAbsolute(resolved)) {
          return NextResponse.json(
            { error: "絶対パスまたは ~/... 形式で指定してください" },
            { status: 400 }
          );
        }
      }
      patch.dataDir = dataDir;
    }

    // backupDir の更新
    if (body.backupDir !== undefined) {
      const backupDir = body.backupDir;
      if (typeof backupDir !== "string") {
        return NextResponse.json({ error: "backupDir は文字列で指定してください" }, { status: 400 });
      }
      if (backupDir) {
        const resolved = expandConfigPath(backupDir);
        if (!path.isAbsolute(resolved)) {
          return NextResponse.json(
            { error: "絶対パスまたは ~/... 形式で指定してください" },
            { status: 400 }
          );
        }
      }
      patch.backupDir = backupDir;
    }

    // 通知設定の更新
    if (body.notify !== undefined && typeof body.notify === "object") {
      const current = await getAppConfig();
      patch.notify = { ...DEFAULT_NOTIFY_CONFIG, ...current.notify, ...body.notify };
    }

    // 外部アプリの更新
    if (terminalApp !== undefined) patch.terminalApp = String(terminalApp);
    if (editorApp !== undefined) patch.editorApp = String(editorApp);
    if (Array.isArray(body.terminalApps)) patch.terminalApps = body.terminalApps;
    if (Array.isArray(body.editorApps)) patch.editorApps = body.editorApps;

    // dataDir を変更する場合のみマイグレーション処理
    if (patch.dataDir !== undefined && migrate) {
      const [sitesContent, targetsContent, presetsContent] = await Promise.all([
        fs.readFile(await resolveSitesJsonPath(), "utf-8").catch(() => null),
        fs.readFile(await resolveDeployTargetsJsonPath(), "utf-8").catch(() => null),
        fs.readFile(await resolvePluginPresetsJsonPath(), "utf-8").catch(() => null),
      ]);

      const updated = await saveAppConfig(patch);

      if (patch.dataDir) {
        const newDir = expandConfigPath(patch.dataDir as string);
        await fs.mkdir(newDir, { recursive: true });

        for (const { name, content } of [
          { name: "sites.json", content: sitesContent },
          { name: "deploy-targets.json", content: targetsContent },
          { name: "plugin-presets.json", content: presetsContent },
        ]) {
          if (!content) continue;
          const dest = path.join(newDir, name);
          const exists = await fs.access(dest).then(() => true).catch(() => false);
          if (!exists) await fs.writeFile(dest, content, "utf-8");
        }
      }

      const resolvedDataDir = expandConfigPath(updated.dataDir) || path.join(process.cwd(), "data");
      return NextResponse.json({
        ...updated,
        resolvedDataDir,
        resolvedSitesJsonPath: path.join(resolvedDataDir, "sites.json"),
        resolvedDeployTargetsJsonPath: path.join(resolvedDataDir, "deploy-targets.json"),
        resolvedPluginPresetsJsonPath: path.join(resolvedDataDir, "plugin-presets.json"),
      });
    }

    const updated = await saveAppConfig(patch);
    const resolvedDataDir = await resolveDataDir();
    const resolvedBackupDir = await resolveBackupDir();
    return NextResponse.json({
      ...updated,
      resolvedDataDir,
      resolvedBackupDir,
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
