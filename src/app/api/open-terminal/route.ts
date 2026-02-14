import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

/**
 * POST /api/open-terminal - ローカルフォルダをターミナルで開く
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

    // OSに応じてコマンドを実行（execFileでシェルを経由せず安全に実行）
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS - デフォルトのターミナルで開く
      await execFileAsync("open", ["-a", "Terminal", path]);
    } else if (platform === "win32") {
      // Windows - explorerでフォルダを開き、ユーザーがcmdを起動する想定
      // cmd.exeを直接開くのはセキュリティ上避ける
      await execFileAsync("explorer", [path]);
    } else {
      // Linux - gnome-terminalを使用
      await execFileAsync("gnome-terminal", ["--working-directory", path]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to open terminal:", error);
    return NextResponse.json(
      { error: "ターミナルを開けませんでした" },
      { status: 500 }
    );
  }
}
