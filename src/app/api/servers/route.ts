import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DeployTarget, MonitoringConfig } from "@/types";
import { getDeployTargets, addDeployTarget } from "@/lib/deploy-targets";
import { getCachedHealth } from "@/lib/server-monitor";

/**
 * GET /api/servers - SSH接続可能な保守対象サーバー一覧（キャッシュ済みヘルスを含む）
 */
export async function GET() {
  try {
    const targets = await getDeployTargets();
    const sshTargets = targets.filter((t) => t.type === "ssh" && t.ssh);

    const servers = await Promise.all(
      sshTargets.map(async (t) => ({
        id: t.id,
        name: t.name,
        vhost: t.vhost,
        host: t.ssh?.host,
        siteId: t.siteId,
        managed: t.managed ?? false,
        tags: t.tags ?? [],
        monitoring: t.monitoring,
        health: await getCachedHealth(t.id),
      }))
    );

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("Failed to list servers:", error);
    return NextResponse.json({ error: "サーバー一覧の取得に失敗しました" }, { status: 500 });
  }
}

interface CreateServerRequest {
  name: string;
  vhost: string;
  wordpressPath: string;
  ssh: {
    host: string;
    user: string;
    port?: number;
    keyPath?: string;
  };
  wpCliPath?: string;
  basicAuth?: { user: string; password: string };
  tags?: string[];
  monitoring?: MonitoringConfig;
}

/**
 * POST /api/servers - 保守専用サーバーを登録
 *
 * ローカルサイトに紐付かない外部サーバー用。SSH必須で、
 * デプロイ専用フィールド（database / exclude / ftp）は持たない。
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateServerRequest = await request.json();

    if (!body.name || !body.vhost || !body.wordpressPath) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    if (!body.ssh?.host || !body.ssh?.user) {
      return NextResponse.json(
        { error: "SSHホストとSSHユーザーは必須です" },
        { status: 400 }
      );
    }

    // 名前の重複チェック（保守専用サーバー同士で比較）
    const allTargets = await getDeployTargets();
    if (allTargets.some((t) => !t.siteId && t.name === body.name)) {
      return NextResponse.json(
        { error: "同じ名前の保守サーバーが既に存在します" },
        { status: 400 }
      );
    }

    const target: DeployTarget = {
      id: randomUUID(),
      // siteId は付けない = 保守専用サーバー
      name: body.name,
      type: "ssh",
      managed: true,
      tags: body.tags?.length ? body.tags : undefined,
      vhost: body.vhost,
      wordpressPath: body.wordpressPath,
      ssh: {
        host: body.ssh.host,
        user: body.ssh.user,
        port: body.ssh.port || 22,
        keyPath: body.ssh.keyPath || undefined,
      },
      basicAuth: body.basicAuth?.user ? body.basicAuth : undefined,
      monitoring: body.monitoring,
      // 未指定なら「未検出」として扱い、接続テストで判定させる
      wpCli: body.wpCliPath ? { available: true, path: body.wpCliPath } : undefined,
    };

    await addDeployTarget(target);

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("Failed to create server:", error);
    return NextResponse.json({ error: "サーバーの登録に失敗しました" }, { status: 500 });
  }
}
