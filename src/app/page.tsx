import { SiteList } from "@/components/site-list";
import { getSites } from "@/lib/sites";

export default async function Dashboard() {
  const sites = await getSites();

  // 表示用に変換
  const displaySites = sites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    hostname: site.config.hostname,
    hostnameMode: site.config.hostnameMode,
    path: site.path,
    port: site.config.port,
    wpVersion: site.config.wordpress.version,
    phpVersion: site.config.php.version,
    dbType: `${site.config.database.type === "mysql" ? "MySQL" : "MariaDB"} ${site.config.database.version}`,
    admin: site.config.wordpress.admin,
    multisite: site.config.wordpress.multisite,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">サイト一覧</h1>
        <p className="text-muted-foreground">管理中のWordPressサイト</p>
      </div>

      {displaySites.length > 0 ? (
        <SiteList initialSites={displaySites} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>サイトがありません</p>
          <p className="text-sm">「新規サイト作成」から始めましょう</p>
        </div>
      )}
    </div>
  );
}
