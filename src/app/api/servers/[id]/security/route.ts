import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import {
  runRemoteSecurityScan,
  saveRemoteSecurityResult,
  getCachedRemoteSecurity,
} from "@/lib/remote-security";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/[id]/security - キャッシュ済みセキュリティ結果
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await getCachedRemoteSecurity(id);
  return NextResponse.json({ result });
}

/**
 * POST /api/servers/[id]/security - セキュリティスキャンを実行して保存
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target) {
      return NextResponse.json({ error: "サーバーが見つかりません" }, { status: 404 });
    }
    if (target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーのみ対応しています" }, { status: 400 });
    }

    const result = await runRemoteSecurityScan(target);
    await saveRemoteSecurityResult(result);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Remote security scan failed:", error);
    return NextResponse.json({ error: "セキュリティスキャンに失敗しました" }, { status: 500 });
  }
}
