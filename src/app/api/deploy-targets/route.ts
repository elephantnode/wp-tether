import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DeployTarget } from "@/types";
import { getDeployTargets, addDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";

/**
 * GET /api/deploy-targets - デプロイターゲット一覧を取得
 * クエリパラメータ: siteId (オプション)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") ?? undefined;

    const targets = await getDeployTargets(siteId);
    return NextResponse.json({ targets });
  } catch (error) {
    console.error("Failed to get deploy targets:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの取得に失敗しました" },
      { status: 500 }
    );
  }
}

interface CreateDeployTargetRequest {
  siteId: string;
  name: string;
  type: "ssh" | "sftp" | "ftp";
  vhost: string;
  wordpressPath: string;
  ssh?: {
    host: string;
    user: string;
    port: number;
    keyPath?: string;
  };
  ftp?: {
    host: string;
    user: string;
    password: string;
    port: number;
    passive: boolean;
  };
  database: {
    host: string;
    name: string;
    user: string;
    password: string;
    charset?: string;
  };
  exclude?: string[];
}

/**
 * POST /api/deploy-targets - デプロイターゲットを作成
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateDeployTargetRequest = await request.json();

    // バリデーション
    if (!body.siteId || !body.name || !body.type || !body.vhost || !body.wordpressPath) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    // サイトの存在確認
    const site = await getSite(body.siteId);
    if (!site) {
      return NextResponse.json(
        { error: "指定されたサイトが存在しません" },
        { status: 404 }
      );
    }

    // SSH設定の検証
    if (body.type === "ssh" && !body.ssh) {
      return NextResponse.json(
        { error: "SSH接続にはSSH設定が必要です" },
        { status: 400 }
      );
    }

    // FTP設定の検証
    if (body.type === "ftp" && !body.ftp) {
      return NextResponse.json(
        { error: "FTP接続にはFTP設定が必要です" },
        { status: 400 }
      );
    }

    // 名前の重複チェック（同一サイト内）
    const existingTargets = await getDeployTargets(body.siteId);
    if (existingTargets.some((t) => t.name === body.name)) {
      return NextResponse.json(
        { error: "同じ名前のデプロイターゲットが既に存在します" },
        { status: 400 }
      );
    }

    // デプロイターゲットを作成
    const target: DeployTarget = {
      id: randomUUID(),
      siteId: body.siteId,
      name: body.name,
      type: body.type,
      vhost: body.vhost,
      wordpressPath: body.wordpressPath,
      ssh: body.ssh,
      ftp: body.ftp,
      database: body.database,
      exclude: body.exclude || [],
    };

    await addDeployTarget(target);

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("Failed to create deploy target:", error);
    return NextResponse.json(
      { error: "デプロイターゲットの作成に失敗しました" },
      { status: 500 }
    );
  }
}
