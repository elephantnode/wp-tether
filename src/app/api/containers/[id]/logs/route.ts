import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * GET /api/containers/[id]/logs - コンテナログを取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tail = searchParams.get("tail") || "100";

    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["logs", "--tail", tail, "--timestamps", id],
      { timeout: 30000, maxBuffer: 1024 * 1024 * 5 }
    );

    // docker logsはstderrにも出力することがある
    const logs = stdout + stderr;

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Failed to get container logs:", error);
    return NextResponse.json(
      { error: "Failed to get container logs" },
      { status: 500 }
    );
  }
}
