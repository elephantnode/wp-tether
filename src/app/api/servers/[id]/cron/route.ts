import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { listCronEvents, runDueCron, backupRemoteDbNow } from "@/lib/remote-ops";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/[id]/cron - WP-Cron イベント一覧
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target || target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }
    const result = await listCronEvents(target);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list cron events:", error);
    return NextResponse.json({ error: "cron一覧の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST /api/servers/[id]/cron - { op: "run-due" | "backup" }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target || target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }
    const body = await request.json();
    const op = body.op as string;

    if (op === "run-due") {
      const result = await runDueCron(target);
      return NextResponse.json({ result });
    }
    if (op === "backup") {
      const result = await backupRemoteDbNow(target);
      return NextResponse.json({ result });
    }
    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  } catch (error) {
    console.error("Cron operation failed:", error);
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }
}
