import { NextResponse } from "next/server";
import { applyHosts, getEnabledHosts } from "@/lib/hosts";

/**
 * POST /api/hosts/apply - desired state を /etc/hosts に反映する。
 * macOS のパスワード入力ダイアログが表示される。
 */
export async function POST() {
  try {
    const enabled = await getEnabledHosts();
    await applyHosts(enabled);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "CANCELED") {
      return NextResponse.json(
        { error: "キャンセルされました", canceled: true },
        { status: 409 }
      );
    }
    console.error("Failed to apply hosts:", error);
    return NextResponse.json(
      { error: message || "hosts の反映に失敗しました" },
      { status: 500 }
    );
  }
}
