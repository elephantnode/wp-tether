import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * GET /api/pick-folder - ネイティブフォルダ選択ダイアログを開く
 * macOS: osascript、Linux: zenity/kdialog
 */
export async function GET() {
  const platform = process.platform;

  try {
    let selectedPath: string;

    if (platform === "darwin") {
      const { stdout } = await execFileAsync("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "データフォルダを選択してください")',
      ]);
      // 末尾の改行とスラッシュを除去
      selectedPath = stdout.trim().replace(/\/$/, "");
    } else if (platform === "linux") {
      // zenity が利用可能な場合
      const { stdout } = await execFileAsync("zenity", [
        "--file-selection",
        "--directory",
        "--title=データフォルダを選択",
      ]);
      selectedPath = stdout.trim();
    } else {
      return NextResponse.json(
        { error: "このOSではフォルダピッカーはサポートされていません" },
        { status: 400 }
      );
    }

    if (!selectedPath) {
      return NextResponse.json({ cancelled: true });
    }

    return NextResponse.json({ path: selectedPath });
  } catch (error) {
    // ユーザーがキャンセルした場合も osascript はエラーを返す
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("User canceled") || msg.includes("cancelled")) {
      return NextResponse.json({ cancelled: true });
    }
    // zenity のキャンセルは exit code 1
    if ((error as NodeJS.ErrnoException).code === "1") {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json(
      { error: "フォルダ選択に失敗しました" },
      { status: 500 }
    );
  }
}
