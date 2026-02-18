import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSite } from "@/lib/sites";
import {
  generateDockerCompose,
  generateEnvFile,
  generateCaddyfile,
  generatePhpIni,
} from "@/lib/docker-compose";

/**
 * POST /api/sites/[id]/regenerate - サイトの設定ファイルを再生成
 * docker-compose.yml, .env, Caddyfile, php/custom.ini を最新のテンプレートで再生成
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const site = await getSite(id);
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const sitePath = site.path;

    // mkcert証明書の存在確認（カスタムホスト名モードの場合）
    let useMkcert = false;
    if (site.config.hostnameMode === "custom") {
      try {
        await fs.access(path.join(sitePath, "certs", "cert.pem"));
        useMkcert = true;
      } catch {
        // 証明書がない場合はtls internalを使用
      }
    }

    // 設定ファイルを再生成
    const dockerCompose = generateDockerCompose({
      projectName: site.name,
      port: site.config.port,
      config: site.config,
    });

    const envFile = generateEnvFile({
      projectName: site.name,
      port: site.config.port,
      config: site.config,
    });

    const phpIni = generatePhpIni({
      projectName: site.name,
      port: site.config.port,
      config: site.config,
    });

    // ファイルを書き込み
    await fs.writeFile(path.join(sitePath, "docker-compose.yml"), dockerCompose);
    await fs.writeFile(path.join(sitePath, ".env"), envFile);
    await fs.writeFile(path.join(sitePath, "php", "custom.ini"), phpIni);

    // カスタムホスト名モードの場合のみCaddyfileを再生成
    if (site.config.hostnameMode === "custom") {
      const caddyfile = generateCaddyfile({
        projectName: site.name,
        port: site.config.port,
        config: site.config,
        useMkcert,
      });
      await fs.writeFile(path.join(sitePath, "Caddyfile"), caddyfile);
    }

    return NextResponse.json({
      success: true,
      message: "設定ファイルを再生成しました。コンテナを再起動すると反映されます。",
      regenerated: [
        "docker-compose.yml",
        ".env",
        "php/custom.ini",
        ...(site.config.hostnameMode === "custom" ? ["Caddyfile"] : []),
      ],
    });
  } catch (error) {
    console.error("Failed to regenerate site config:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate" },
      { status: 500 }
    );
  }
}
