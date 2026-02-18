import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * POST /api/containers/[id]/restart - コンテナを再起動
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await execFileAsync("docker", ["restart", id], { timeout: 60000 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to restart container:", error);
    return NextResponse.json(
      { error: "Failed to restart container" },
      { status: 500 }
    );
  }
}
