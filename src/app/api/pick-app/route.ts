import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * GET /api/pick-app - ネイティブアプリ選択ダイアログを開き、アプリ名を返す
 * macOS: osascript の choose application を使用
 * 返り値の appName は `open -a [appName]` にそのまま渡せる形式
 */
export async function GET() {
  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "アプリピッカーは macOS のみサポートしています" },
      { status: 400 }
    );
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'name of (choose application with prompt "使用するアプリを選択してください")',
    ]);

    const appName = stdout.trim();
    if (!appName) {
      return NextResponse.json({ cancelled: true });
    }

    return NextResponse.json({ appName });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("User canceled") || msg.includes("cancelled")) {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json(
      { error: "アプリ選択に失敗しました" },
      { status: 500 }
    );
  }
}
