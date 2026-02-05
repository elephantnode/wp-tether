import { SiteCard } from "@/components/site-card";
import { getSites } from "@/lib/sites";

export default async function Dashboard() {
  const sites = await getSites();

  // 表示用に変換
  const displaySites = sites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    port: site.config.port,
    dbType: `${site.config.database.type === "mysql" ? "MySQL" : "MariaDB"} ${site.config.database.version}`,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">サイト一覧</h1>
        <p className="text-muted-foreground">管理中のWordPressサイト</p>
      </div>

      {displaySites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displaySites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>サイトがありません</p>
          <p className="text-sm">「新規サイト作成」から始めましょう</p>
        </div>
      )}
    </div>
  );
}
