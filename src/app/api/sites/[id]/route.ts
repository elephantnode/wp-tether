import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { getSite, deleteSite } from "@/lib/sites";

const execAsync = promisify(exec);

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/sites/[id] - サイトを削除
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { deleteFiles, deleteVolumes } = await request.json().catch(() => ({ 
      deleteFiles: false,
      deleteVolumes: false 
    }));

    const site = await getSite(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // コンテナが動いていたら停止
    // ボリューム削除オプションがある場合は -v フラグを追加
    // docker compose down -v は、そのプロジェクトのdocker-compose.ymlで定義されている
    // ボリュームのみを削除するため、他のプロジェクトのボリュームには影響しません
    try {
      const command = deleteVolumes 
        ? "docker compose down -v" 
        : "docker compose down";
      await execAsync(command, {
        cwd: site.path,
      });
    } catch {
      // コンテナが存在しない場合は無視
    }

    // ボリューム削除が指定されている場合、docker compose down -v が失敗した場合のフォールバック
    // docker-compose.ymlから実際に定義されているボリューム名を取得して削除
    // これにより、そのプロジェクトに関連するボリュームのみが削除されます
    if (deleteVolumes) {
      try {
        // docker compose config --volumes で、そのプロジェクトで定義されているボリューム名を取得
        // このコマンドは、docker-compose.ymlファイルが存在する場合のみ動作します
        const { stdout: volumesOutput } = await execAsync("docker compose config --volumes", {
          cwd: site.path,
        }).catch(() => ({ stdout: "" }));

        if (volumesOutput && volumesOutput.trim()) {
          // プロジェクト名を取得（.envファイルから、またはディレクトリ名から推測）
          let projectName = "";
          try {
            const envContent = await fs.readFile(`${site.path}/.env`, "utf-8");
            const projectNameMatch = envContent.match(/^PROJECT_NAME=(.+)$/m);
            if (projectNameMatch) {
              projectName = projectNameMatch[1].trim();
            }
          } catch {
            // .envファイルが存在しない場合は無視
          }

          // プロジェクト名が取得できない場合は、ディレクトリ名から推測
          if (!projectName) {
            const pathParts = site.path.split(/[/\\]/);
            const dirName = pathParts[pathParts.length - 1] || site.config.projectName;
            projectName = dirName;
          }

          // Docker Composeのプロジェクト名の正規化（小文字、ハイフンをアンダースコアに変換）
          const normalizedProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');

          // docker-compose.ymlで定義されているボリューム名を取得
          const volumeNames = volumesOutput
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

          // プロジェクト名をプレフィックスとして付与（Docker Composeの命名規則に従う）
          // 実際のボリューム名は {project_name}_{volume_name} の形式
          // これにより、そのプロジェクトに関連するボリュームのみが削除されます
          for (const volumeName of volumeNames) {
            const fullVolumeName = `${normalizedProjectName}_${volumeName}`;
            try {
              await execAsync(`docker volume rm ${fullVolumeName}`);
            } catch {
              // ボリュームが存在しない、または使用中で削除できない場合は無視
              // docker compose down -v が成功していれば、ボリュームは既に削除されています
            }
          }
        }
      } catch {
        // ボリューム削除の失敗は無視（既に削除されている可能性がある）
        // docker compose down -v が成功していれば、ボリュームは既に削除されています
      }
    }

    // ファイル削除オプション
    if (deleteFiles) {
      await fs.rm(site.path, { recursive: true, force: true });
    }

    // サイト情報を削除
    await deleteSite(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました" },
      { status: 500 }
    );
  }
}
