import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import {
  getUpdatePreview,
  runUpdate,
  setMaintenanceMode,
  getMaintenanceMode,
  runWpCliCommand,
} from "@/lib/remote-maintenance";
import { MaintenanceAction, CoreUpdateOption } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/[id]/maintenance - 更新プレビュー + メンテナンスモード状態
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target || target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }

    const [preview, maintenanceMode] = await Promise.all([
      getUpdatePreview(target),
      getMaintenanceMode(target),
    ]);

    return NextResponse.json({ preview, maintenanceMode });
  } catch (error) {
    console.error("Maintenance preview failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取得に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/servers/[id]/maintenance - 更新実行 / メンテモード切替 / WP-CLI実行
 * body: { op: "update" | "maintenance-mode" | "wp-cli", ... }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await getDeployTarget(id);
    if (!target || target.type !== "ssh" || !target.ssh) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }

    const body = await request.json();
    const op = body.op as string;

    if (op === "update") {
      const action = body.action as MaintenanceAction;
      const createBackup = body.createBackup !== false;
      const coreOption = body.coreOption as CoreUpdateOption | undefined;
      const result = await runUpdate(target, action, createBackup, coreOption);
      return NextResponse.json({ result });
    }

    if (op === "maintenance-mode") {
      const result = await setMaintenanceMode(target, !!body.active);
      return NextResponse.json({ result });
    }

    if (op === "wp-cli") {
      const result = await runWpCliCommand(target, String(body.command || ""));
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  } catch (error) {
    console.error("Maintenance operation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作に失敗しました" },
      { status: 500 }
    );
  }
}
