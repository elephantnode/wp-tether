import { NextResponse } from "next/server";
import { getDeployTargets } from "@/lib/deploy-targets";
import { getCachedHealth } from "@/lib/server-monitor";

/**
 * GET /api/servers - SSH接続可能な保守対象サーバー一覧（キャッシュ済みヘルスを含む）
 */
export async function GET() {
  try {
    const targets = await getDeployTargets();
    const sshTargets = targets.filter((t) => t.type === "ssh" && t.ssh);

    const servers = await Promise.all(
      sshTargets.map(async (t) => ({
        id: t.id,
        name: t.name,
        vhost: t.vhost,
        host: t.ssh?.host,
        siteId: t.siteId,
        managed: t.managed ?? false,
        tags: t.tags ?? [],
        monitoring: t.monitoring,
        health: await getCachedHealth(t.id),
      }))
    );

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("Failed to list servers:", error);
    return NextResponse.json({ error: "サーバー一覧の取得に失敗しました" }, { status: 500 });
  }
}
