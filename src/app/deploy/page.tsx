import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FolderSync } from "lucide-react";
import { getDeployTargets } from "@/lib/deploy-targets";
import { getSites } from "@/lib/sites";
import { DeployList, type SiteGroup } from "@/components/deploy-list";

export default async function DeployPage() {
  const [targets, sites] = await Promise.all([
    getDeployTargets(),
    getSites(),
  ]);

  // サイトごとにターゲットをグループ化
  const targetsBySite = new Map<string, typeof targets>();
  const standaloneTargets: typeof targets = [];
  for (const target of targets) {
    if (target.siteId) {
      const existing = targetsBySite.get(target.siteId) || [];
      existing.push(target);
      targetsBySite.set(target.siteId, existing);
    } else {
      standaloneTargets.push(target);
    }
  }

  // サイトの保存順を維持してグループ化（サイト一覧と同じ並び）
  const groups: SiteGroup[] = sites.map((site) => ({
    siteId: site.id,
    siteName: site.name,
    sitePath: site.path,
    siteStatus: site.status,
    targets: targetsBySite.get(site.id) ?? [],
  }));

  const hasAnything = sites.length > 0 || standaloneTargets.length > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">デプロイ</h1>
          <p className="text-muted-foreground">
            リモートサーバーとの同期設定（ドラッグでサイトを並べ替え）
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/servers/new">
              <Plus className="w-4 h-4 mr-2" />
              保守サーバー追加
            </Link>
          </Button>
          <Button asChild>
            <Link href="/deploy/new">
              <Plus className="w-4 h-4 mr-2" />
              ターゲット追加
            </Link>
          </Button>
        </div>
      </div>

      {hasAnything ? (
        <DeployList initialGroups={groups} standaloneTargets={standaloneTargets} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderSync className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">デプロイターゲットがありません</h3>
            <p className="text-muted-foreground mb-4">
              リモートサーバーへの接続設定を追加して、ファイル同期を始めましょう
            </p>
            <Button asChild>
              <Link href="/deploy/new">
                <Plus className="w-4 h-4 mr-2" />
                ターゲット追加
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
