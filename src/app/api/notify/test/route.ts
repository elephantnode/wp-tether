import { NextRequest, NextResponse } from "next/server";
import { sendTestNotification } from "@/lib/notify";

/**
 * POST /api/notify/test
 * body: { channel: "slack" | "google_chat" | "mac"; webhookUrl?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, webhookUrl } = body as {
      channel: "slack" | "google_chat" | "mac";
      webhookUrl?: string;
    };

    if (!channel) {
      return NextResponse.json({ error: "channel を指定してください" }, { status: 400 });
    }

    const result = await sendTestNotification(channel, webhookUrl);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "送信失敗" },
      { status: 500 }
    );
  }
}
