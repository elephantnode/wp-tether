import { NextResponse } from "next/server";
import { getPluginPresets, savePluginPresets } from "@/lib/plugin-presets";

export async function GET() {
  try {
    const presets = await getPluginPresets();
    return NextResponse.json(presets);
  } catch (error) {
    console.error("Failed to get plugin presets:", error);
    return NextResponse.json(
      { error: "プラグインプリセットの取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { plugins } = body;

    if (!Array.isArray(plugins)) {
      return NextResponse.json(
        { error: "plugins は配列である必要があります" },
        { status: 400 }
      );
    }

    // スラッグのバリデーション（空白除去、重複除去）
    const cleanedPlugins = [...new Set(
      plugins
        .map((p: string) => p.trim().toLowerCase())
        .filter((p: string) => p.length > 0)
    )];

    await savePluginPresets({ plugins: cleanedPlugins });
    return NextResponse.json({ plugins: cleanedPlugins });
  } catch (error) {
    console.error("Failed to save plugin presets:", error);
    return NextResponse.json(
      { error: "プラグインプリセットの保存に失敗しました" },
      { status: 500 }
    );
  }
}
