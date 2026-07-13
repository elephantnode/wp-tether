import { HostsManager } from "@/components/hosts-manager";

export default function HostsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">hosts 管理</h1>
        <p className="text-muted-foreground">
          カスタムホスト名サイトを <code>/etc/hosts</code> に一括反映します
        </p>
      </div>
      <HostsManager />
    </div>
  );
}
