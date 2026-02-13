import { NextResponse } from "next/server";
import { getSites } from "@/lib/sites";

export async function GET() {
  try {
    const sites = await getSites();

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      type: "sites",
      data: sites,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="wp-tether-sites-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Failed to export sites:", error);
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
