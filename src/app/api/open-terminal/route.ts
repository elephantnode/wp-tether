import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { getAppConfig } from "@/lib/app-config";

const execFileAsync = promisify(execFile);

/**
 * POST /api/open-terminal - ローカルフォルダを設定済みターミナルで開く
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

    if (!existsSync(path)) {
      return NextResponse.json(
        { error: "指定されたパスが存在しません" },
        { status: 404 }
      );
    }

    const platform = process.platform;

    if (platform === "darwin") {
      const config = await getAppConfig();
      const terminalApp = config.terminalApp || "Terminal";
      await execFileAsync("open", ["-a", terminalApp, path]);
    } else if (platform === "win32") {
      await execFileAsync("explorer", [path]);
    } else {
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
