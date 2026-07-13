import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { getDeployTarget } from "@/lib/deploy-targets";
import { getSite } from "@/lib/sites";

const execFileAsync = promisify(execFile);

const SCOPE_PATHS: Record<string, string> = {
  themes: "wp-content/themes",
  plugins: "wp-content/plugins",
  "mu-plugins": "wp-content/mu-plugins",
  languages: "wp-content/languages",
  uploads: "wp-content/uploads",
};

function expandKeyPath(keyPath: string | undefined): string | undefined {
  if (!keyPath) return undefined;
  if (keyPath.startsWith("~/")) {
    return path.join(os.homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * GET /api/sync/list
 * スコープディレクトリ内のアイテム（テーマ/プラグイン等）一覧を返す
 *
 * Query params:
 *   targetId: string
 *   scope: "themes" | "plugins" | "mu-plugins" | "languages" | "uploads"
 *   source: "local" | "remote" (default: "local")
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetId = searchParams.get("targetId");
  const scope = searchParams.get("scope");
  const source = searchParams.get("source") ?? "local";

  if (!targetId || !scope) {
    return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
  }

  if (!(scope in SCOPE_PATHS)) {
    return NextResponse.json({ error: "無効なスコープです" }, { status: 400 });
  }

  const target = await getDeployTarget(targetId);
  if (!target) {
    return NextResponse.json({ error: "デプロイターゲットが見つかりません" }, { status: 404 });
  }

  const site = await getSite(target.siteId);
  if (!site) {
    return NextResponse.json({ error: "サイトが見つかりません" }, { status: 404 });
  }

  const relativePath = SCOPE_PATHS[scope];

  if (source === "local") {
    try {
      const localDir = path.join(site.path, "src", relativePath);
      if (!fs.existsSync(localDir)) {
        return NextResponse.json({ items: [] });
      }
      const entries = fs.readdirSync(localDir, { withFileTypes: true });
      const items = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();
      return NextResponse.json({ items });
    } catch {
      return NextResponse.json(
        { error: "ローカルディレクトリの読み取りに失敗しました" },
        { status: 500 }
      );
    }
  } else {
    // remote
    if (!target.ssh) {
      return NextResponse.json({ error: "SSH設定がありません" }, { status: 400 });
    }

    try {
      const { host, user, port } = target.ssh;
      const keyPath = expandKeyPath(target.ssh.keyPath);
      const remoteDir = target.wordpressPath.endsWith("/")
        ? target.wordpressPath + relativePath
        : target.wordpressPath + "/" + relativePath;

      const sshArgs = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-p", String(port),
      ];
      if (keyPath) sshArgs.push("-i", keyPath);

      // ディレクトリのみリスト（末尾スラッシュで判定）
      const quotedDir = "'" + remoteDir.replace(/'/g, "'\"'\"'") + "'";
      sshArgs.push(`${user}@${host}`, `ls -1p ${quotedDir} 2>/dev/null | grep '/' | sed 's|/$||'`);

      const { stdout } = await execFileAsync("ssh", sshArgs, { timeout: 30000 });
      const items = stdout
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("."))
        .sort();
      return NextResponse.json({ items });
    } catch {
      return NextResponse.json(
        { error: "リモートディレクトリの読み取りに失敗しました" },
        { status: 500 }
      );
    }
  }
}
