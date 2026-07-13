import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getRemoteLog } from "@/lib/remote-ops";
import { RemoteLogType } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/[id]/logs?type=debug|php-error&tail=200
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target || target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") as RemoteLogType) || "debug";
    const tail = parseInt(searchParams.get("tail") || "200", 10);

    const log = await getRemoteLog(target, type, tail);
    return NextResponse.json({ log });
  } catch (error) {
    console.error("Failed to fetch remote log:", error);
    return NextResponse.json({ error: "ログ取得に失敗しました" }, { status: 500 });
  }
}
