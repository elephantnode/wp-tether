import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getSite } from "@/lib/sites";
import { getPluginPresets } from "@/lib/plugin-presets";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId は必須です" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const site = await getSite(siteId);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // サイトが稼働中か確認
    if (site.status !== "running") {
      return NextResponse.json(
        { error: "サイトが稼働していません。起動してから実行してください。" },
        { status: 400 }
      );
    }

    // プリセットを取得
    const presets = await getPluginPresets();
    if (presets.plugins.length === 0) {
      return NextResponse.json(
        { error: "プラグインプリセットが登録されていません。設定画面で登録してください。" },
        { status: 400 }
      );
    }

    // WP-CLI でプラグインをインストール + 有効化
    const pluginList = presets.plugins.join(" ");
    const command = `docker compose run --rm wpcli plugin install ${pluginList} --activate`;

    const { stdout, stderr } = await execAsync(command, {
      cwd: site.path,
      timeout: 300000, // 5分
    });

    return NextResponse.json({
      success: true,
      plugins: presets.plugins,
      output: stdout,
      stderr: stderr || undefined,
    });
  } catch (error) {
    console.error("Failed to install plugins:", error);
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      { error: `プラグインのインストールに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
