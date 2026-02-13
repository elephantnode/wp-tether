import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execAsync = promisify(exec);

/**
 * POST /api/open-folder - ローカルフォルダをファイルマネージャーで開く
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "パスが指定されていません" },
        { status: 400 }
      );
    }

    // パスが存在するか確認
    if (!existsSync(path)) {
      return NextResponse.json(
        { error: "指定されたパスが存在しません" },
        { status: 404 }
      );
    }

    // OSに応じてコマンドを実行
    const platform = process.platform;
    let command: string;

    if (platform === "darwin") {
      // macOS
      command = `open "${path}"`;
    } else if (platform === "win32") {
      // Windows
      command = `explorer "${path}"`;
    } else {
      // Linux
      command = `xdg-open "${path}"`;
    }

    await execAsync(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to open folder:", error);
    return NextResponse.json(
      { error: "フォルダを開けませんでした" },
      { status: 500 }
    );
  }
}
