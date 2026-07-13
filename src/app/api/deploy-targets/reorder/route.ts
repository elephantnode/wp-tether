import { NextResponse } from "next/server";
import { reorderDeployTargets } from "@/lib/deploy-targets";

/**
 * POST /api/deploy-targets/reorder - デプロイターゲット（サーバー）の並び順を変更
 */
export async function POST(request: Request) {
  try {
    const { ids }: { ids: string[] } = await request.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }
    await reorderDeployTargets(ids);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to reorder targets" }, { status: 500 });
  }
}
