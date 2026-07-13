import { NextRequest, NextResponse } from "next/server";
import { getSites } from "@/lib/sites";
import {
  readHostsFile,
  parseManagedEntries,
  getEnabledHosts,
  setEnabledHosts,
  HOSTS_PATH,
} from "@/lib/hosts";

/**
 * GET /api/hosts - hosts 管理の状態を返す
 */
export async function GET() {
  try {
    const sites = await getSites();
    const customSites = sites
      .filter((s) => s.config.hostnameMode === "custom" && s.config.hostname)
      .map((s) => ({
        siteId: s.id,
        name: s.name,
        hostname: s.config.hostname,
        status: s.status,
      }));

    let applied: string[] = [];
    let content = "";
    try {
      content = await readHostsFile();
      applied = parseManagedEntries(content);
    } catch {
      applied = [];
    }

    const enabled = await getEnabledHosts();

    // applied と enabled の差分（順不同で比較）
    const appliedSet = new Set(applied);
    const enabledSet = new Set(enabled);
    const dirty =
      appliedSet.size !== enabledSet.size ||
      [...enabledSet].some((h) => !appliedSet.has(h));

    return NextResponse.json({
      customSites,
      applied,
      enabled,
      dirty,
      content,
      hostsPath: HOSTS_PATH,
      platform: process.platform,
    });
  } catch (error) {
    console.error("Failed to get hosts state:", error);
    return NextResponse.json(
      { error: "hosts の状態を取得できませんでした" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hosts - desired state（有効化したいホスト名）を保存する（sudo 不要）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const enabled = body?.enabled;
    if (!Array.isArray(enabled) || enabled.some((h) => typeof h !== "string")) {
      return NextResponse.json(
        { error: "enabled は文字列の配列である必要があります" },
        { status: 400 }
      );
    }

    await setEnabledHosts(enabled);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save hosts config:", error);
    return NextResponse.json(
      { error: "設定を保存できませんでした" },
      { status: 500 }
    );
  }
}
