import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";
import {
  startTunnel,
  stopTunnel,
  getTunnel,
  getAvailableProviders,
  TunnelProvider,
} from "@/lib/tunnel";

/**
 * wp-config.phpに動的URL設定を追加（トンネル経由アクセス用）
 */
async function ensureDynamicUrlConfig(sitePath: string): Promise<void> {
  const wpConfigPath = path.join(sitePath, "src", "wp-config.php");

  try {
    let content = await fs.readFile(wpConfigPath, "utf-8");

    // すでに動的URL設定が存在するかチェック
    if (content.includes("WP_TETHER_DYNAMIC_URL")) {
      return; // すでに設定済み
    }

    // 動的URL設定を追加（<?phpの直後に挿入）
    const dynamicUrlCode = `
/** WP_TETHER_DYNAMIC_URL - 動的URL設定（トンネル経由アクセス対応） */
if (isset($_SERVER['HTTP_HOST'])) {
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    if (isset($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $scheme = $_SERVER['HTTP_X_FORWARDED_PROTO'];
    }
    $host = isset($_SERVER['HTTP_X_FORWARDED_HOST']) ? $_SERVER['HTTP_X_FORWARDED_HOST'] : $_SERVER['HTTP_HOST'];
    if (!defined('WP_HOME')) define('WP_HOME', $scheme . '://' . $host);
    if (!defined('WP_SITEURL')) define('WP_SITEURL', $scheme . '://' . $host);
}
`;

    // <?phpの直後に挿入
    content = content.replace(/^<\?php\s*/i, `<?php\n${dynamicUrlCode}\n`);

    await fs.writeFile(wpConfigPath, content);
  } catch (error) {
    // wp-config.phpが存在しない場合などは無視
    console.warn("Could not update wp-config.php:", error);
  }
}

/**
 * GET /api/sites/[id]/tunnel - トンネルの状態を取得
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tunnel = getTunnel(id);
    const availableProviders = await getAvailableProviders();

    return NextResponse.json({ tunnel, availableProviders });
  } catch (error) {
    console.error("Failed to get tunnel:", error);
    return NextResponse.json(
      { error: "Failed to get tunnel status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sites/[id]/tunnel - トンネルを開始
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // リクエストボディからプロバイダーを取得（オプション）
    let preferredProvider: TunnelProvider | undefined;
    try {
      const body = await request.json();
      preferredProvider = body.provider;
    } catch {
      // ボディがない場合は無視
    }

    // 利用可能なプロバイダーを確認
    const availableProviders = await getAvailableProviders();
    if (availableProviders.length === 0) {
      return NextResponse.json(
        {
          error: "トンネルツールがインストールされていません",
          hint: "以下のいずれかをインストールしてください:\n• brew install cloudflared\n• brew install ngrok",
          availableProviders: [],
        },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const site = await getSite(id);
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // wp-config.phpに動的URL設定を追加（トンネル経由でも正しくURLが解決されるように）
    await ensureDynamicUrlConfig(site.path);

    // トンネルは常にWordPressコンテナのポートに直接接続
    // Caddyを経由するとHostヘッダーがmysite.testになり、トンネルのURLとミスマッチする
    const localUrl = `http://localhost:${site.config.port}`;

    // トンネルを開始
    const tunnel = await startTunnel(id, site.name, localUrl, preferredProvider);

    if (tunnel.status === "error") {
      return NextResponse.json(
        { error: tunnel.error || "トンネルの開始に失敗しました" },
        { status: 500 }
      );
    }

    if (!tunnel.publicUrl) {
      return NextResponse.json(
        { error: "トンネルの開始に失敗しました。しばらく待ってから再試行してください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tunnel, availableProviders });
  } catch (error) {
    console.error("Failed to start tunnel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start tunnel" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sites/[id]/tunnel - トンネルを停止
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await stopTunnel(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to stop tunnel:", error);
    return NextResponse.json(
      { error: "Failed to stop tunnel" },
      { status: 500 }
    );
  }
}
