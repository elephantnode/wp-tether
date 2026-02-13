import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Server, Globe, FolderSync } from "lucide-react";
import { getDeployTargets } from "@/lib/deploy-targets";
import { getSites } from "@/lib/sites";
import { DeployTargetCard } from "@/components/deploy-target-card";

export default async function DeployPage() {
  const [targets, sites] = await Promise.all([
    getDeployTargets(),
    getSites(),
  ]);

  // サイトごとにターゲットをグループ化
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const targetsBySite = new Map<string, typeof targets>();

  for (const target of targets) {
    const existing = targetsBySite.get(target.siteId) || [];
    existing.push(target);
    targetsBySite.set(target.siteId, existing);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">デプロイ</h1>
          <p className="text-muted-foreground">
            リモートサーバーとの同期設定
          </p>
        </div>
        <Button asChild>
          <Link href="/deploy/new">
            <Plus className="w-4 h-4 mr-2" />
            ターゲット追加
          </Link>
        </Button>
      </div>

      {targets.length > 0 ? (
        <div className="space-y-8">
          {Array.from(targetsBySite.entries()).map(([siteId, siteTargets]) => {
            const site = siteMap.get(siteId);
            if (!site) return null;

            return (
              <div key={siteId}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{site.name}</h2>
                  <Badge variant="outline">{siteTargets.length} ターゲット</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {siteTargets.map((target) => (
                    <DeployTargetCard
                      key={target.id}
                      target={target}
                      sitePath={site.path}
                      siteStatus={site.status}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
