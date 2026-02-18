import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSites } from "@/lib/sites";

const execFileAsync = promisify(execFile);

export interface ContainerInfo {
  id: string;
  name: string;
  service: string;
  image: string;
  state: "running" | "exited" | "paused" | "created" | "restarting" | "dead";
  status: string;
  ports: string;
  siteId: string;
  siteName: string;
}

/**
 * サイトのコンテナ情報を取得
 */
async function getSiteContainers(
  siteId: string,
  siteName: string,
  sitePath: string
): Promise<ContainerInfo[]> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "ps", "--format", "json", "-a"],
      { cwd: sitePath, timeout: 10000 }
    );

    if (!stdout.trim()) {
      return [];
    }

    const containers: ContainerInfo[] = [];
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      try {
        const container = JSON.parse(line);
        containers.push({
          id: container.ID || "",
          name: container.Name || "",
          service: container.Service || "",
          image: container.Image || "",
          state: container.State?.toLowerCase() || "unknown",
          status: container.Status || "",
          ports: container.Ports || "",
          siteId,
          siteName,
        });
      } catch {
        // JSON解析エラーは無視
      }
    }

    return containers;
  } catch {
    return [];
  }
}

/**
 * GET /api/containers - 全サイトのコンテナ一覧を取得
 */
export async function GET() {
  try {
    const sites = await getSites();

    // 並列で全サイトのコンテナ情報を取得
    const containersBysite = await Promise.all(
      sites.map((site) => getSiteContainers(site.id, site.name, site.path))
    );

    // フラット化
    const containers = containersBysite.flat();

    return NextResponse.json({ containers });
  } catch (error) {
    console.error("Failed to get containers:", error);
    return NextResponse.json(
      { error: "Failed to get containers" },
      { status: 500 }
    );
  }
}
