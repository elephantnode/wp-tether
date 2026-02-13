import { NextResponse } from "next/server";
import { getDeployTargets } from "@/lib/deploy-targets";

export async function GET() {
  try {
    const targets = await getDeployTargets();

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      type: "deploy-targets",
      data: targets,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="wp-tether-deploy-targets-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Failed to export deploy targets:", error);
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
