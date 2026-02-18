import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSite, updateSite } from "@/lib/sites";

const execFileAsync = promisify(execFile);

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/stop - サイトを停止
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    await execFileAsync("docker", ["compose", "down"], {
      cwd: site.path,
    });

    // ステータスを更新
    await updateSite(id, { status: "stopped" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to stop site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "停止に失敗しました" },
      { status: 500 }
    );
  }
}
