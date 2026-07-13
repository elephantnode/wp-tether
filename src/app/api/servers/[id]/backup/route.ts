import { NextRequest, NextResponse } from "next/server";
import { getDeployTarget } from "@/lib/deploy-targets";
import {
  runLocalBackup,
  listBackupGenerations,
  restoreBackup,
  deleteBackupGeneration,
} from "@/lib/local-backup";
import { LocalBackupOptions, BackupRestoreOptions } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadTarget(id: string) {
  const target = await getDeployTarget(id);
  if (!target || target.type !== "ssh" || !target.ssh) return null;
  return target;
}

/**
 * GET /api/servers/[id]/backup - バックアップ世代一覧
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const target = await loadTarget(id);
  if (!target) {
    return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
  }
  const generations = await listBackupGenerations(target);
  return NextResponse.json({ generations });
}

/**
 * POST /api/servers/[id]/backup - バックアップ取得
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await loadTarget(id);
    if (!target) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }
    const options = (await request.json()) as LocalBackupOptions;
    const result = await runLocalBackup(target, options);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Backup failed:", error);
    return NextResponse.json({ error: "バックアップに失敗しました" }, { status: 500 });
  }
}

/**
 * PUT /api/servers/[id]/backup - バックアップから復元
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const target = await loadTarget(id);
    if (!target) {
      return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
    }
    const options = (await request.json()) as BackupRestoreOptions;
    const result = await restoreBackup(target, options);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Restore failed:", error);
    return NextResponse.json({ error: "復元に失敗しました" }, { status: 500 });
  }
}

/**
 * DELETE /api/servers/[id]/backup?generationId=... - 世代削除
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const target = await loadTarget(id);
  if (!target) {
    return NextResponse.json({ error: "SSH接続のサーバーが見つかりません" }, { status: 404 });
  }
  const generationId = new URL(request.url).searchParams.get("generationId");
  if (!generationId) {
    return NextResponse.json({ error: "generationId が必要です" }, { status: 400 });
  }
  const ok = await deleteBackupGeneration(target, generationId);
  return NextResponse.json({ success: ok });
}
