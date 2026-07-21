"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Server,
  RefreshCw,
  Loader2,
  Globe,
  Lock,
  HardDrive,
  Cpu,
  Wrench,
  Shield,
  GripVertical,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
} from "lucide-react";
import { ServerSecurityDialog } from "@/components/server-security-dialog";
import { ServerMaintenanceDialog } from "@/components/server-maintenance-dialog";
import { ServerOpsDialog } from "@/components/server-ops-dialog";
import { ServerBackupDialog } from "@/components/server-backup-dialog";
import { FileText, Database, Plus, Pencil, ShieldCheck, Link2 } from "lucide-react";
import type { ServerHealthResult, HealthStatus, MonitoringConfig } from "@/types";

interface ServerSummary {
  id: string;
  name: string;
  vhost: string;
  host?: string;
  siteId?: string;
  managed: boolean;
  tags: string[];
  monitoring?: MonitoringConfig;
  health: ServerHealthResult | null;
}

function statusColor(status: HealthStatus | undefined): string {
  switch (status) {
    case "ok":
      return "bg-green-500";
    case "warning":
      return "bg-yellow-500";
    case "critical":
      return "bg-red-500";
    default:
      return "bg-muted-foreground";
  }
}

function statusLabel(status: HealthStatus | undefined): string {
  switch (status) {
    case "ok":
      return "正常";
    case "warning":
      return "警告";
    case "critical":
      return "重大";
    default:
      return "不明";
  }
}

function OverallBadge({ status }: { status: HealthStatus | undefined }) {
  return (
    <Badge className={statusColor(status)}>
      ● {statusLabel(status)}
    </Badge>
  );
}

function CheckRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  status: HealthStatus | undefined;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block w-2 h-2 rounded-full ${statusColor(status)}`} />
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="font-medium w-28 shrink-0">{label}</span>
      <span className="text-muted-foreground truncate">{detail}</span>
    </div>
  );
}

function healthDetails(health: ServerHealthResult) {
  const { http, ssl, disk, resource, wp } = health;
  return {
    http:
      http.statusCode !== undefined
        ? `${http.statusCode} / ${http.responseMs ?? "-"}ms${http.message ? ` (${http.message})` : ""}`
        : http.message || "未取得",
    ssl:
      ssl.daysRemaining !== undefined
        ? `残り${ssl.daysRemaining}日${ssl.issuer ? ` / ${ssl.issuer}` : ""}`
        : ssl.message || "未取得",
    disk:
      disk.usagePercent !== undefined
        ? `${disk.usagePercent}%${disk.mount ? ` (${disk.mount})` : ""}`
        : disk.message || "未取得",
    resource:
      resource.memoryUsagePercent !== undefined || resource.load1 !== undefined
        ? `メモリ ${resource.memoryUsagePercent ?? "-"}% / ロード ${resource.load1 ?? "-"}${resource.cpuCores ? `/${resource.cpuCores}` : ""}`
        : resource.message || "未取得",
    wp:
      wp.coreVersion
        ? `v${wp.coreVersion}${wp.message ? ` / ${wp.message}` : " / 最新"}`
        : wp.message || "未取得",
  };
}

/** 表示用ホスト名（vhost のドメイン、取れなければ SSH ホスト） */
function displayHost(s: ServerSummary): string {
  try {
    return new URL(s.vhost).hostname;
  } catch {
    return s.host || s.vhost;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface RowProps {
  s: ServerSummary;
  checking: boolean;
  onCheck: (id: string) => void;
  onSecurity: (s: ServerSummary) => void;
  onMaintenance: (s: ServerSummary) => void;
  onOps: (s: ServerSummary) => void;
  onBackup: (s: ServerSummary) => void;
}

function SortableServerRow({
  s,
  checking,
  onCheck,
  onSecurity,
  onMaintenance,
  onOps,
  onBackup,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
  });
  const [open, setOpen] = useState(false);
  const details = s.health ? healthDetails(s.health) : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 p-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            tabIndex={-1}
            aria-label="ドラッグして並べ替え"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <span className="font-semibold truncate">
                <span className="text-muted-foreground">{displayHost(s)}</span>
                <span className="text-muted-foreground/50 mx-1">＞</span>
                {s.name}
              </span>
              <OverallBadge status={s.health?.overall} />
              {s.siteId ? (
                <Badge variant="outline" className="shrink-0">
                  <Link2 className="w-3 h-3 mr-1" />
                  サイト連携
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  保守専用
                </Badge>
              )}
              {s.monitoring?.enabled && (
                <Badge variant="outline" className="shrink-0 text-blue-600 border-blue-400">
                  監視中 {s.monitoring.intervalMinutes}分
                </Badge>
              )}
              {s.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="shrink-0">
                  {tag}
                </Badge>
              ))}
              {s.health && (
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {formatTime(s.health.checkedAt)}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                  s.health ? "" : "ml-auto"
                } ${open ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => onCheck(s.id)}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pl-8 space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a
                href={s.vhost}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:underline hover:text-foreground flex items-center gap-1"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{s.vhost}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <a
                href={`${s.vhost.replace(/\/$/, "")}/wp-admin/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:underline hover:text-foreground flex items-center gap-1"
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                <span>管理画面</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            {details ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow icon={Globe} label="HTTP稼働" status={s.health!.http.status} detail={details.http} />
                <CheckRow icon={Lock} label="SSL証明書" status={s.health!.ssl.status} detail={details.ssl} />
                <CheckRow icon={HardDrive} label="ディスク" status={s.health!.disk.status} detail={details.disk} />
                <CheckRow icon={Cpu} label="リソース" status={s.health!.resource.status} detail={details.resource} />
                <CheckRow icon={Wrench} label="WordPress" status={s.health!.wp.status} detail={details.wp} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                まだチェックを実行していません。右上の更新ボタンでチェックできます。
              </p>
            )}

            <div className="flex gap-2 flex-wrap pt-1">
              <Button size="sm" variant="outline" onClick={() => onSecurity(s)}>
                <Shield className="w-4 h-4 mr-2" />
                セキュリティ
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMaintenance(s)}>
                <Wrench className="w-4 h-4 mr-2" />
                メンテ
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOps(s)}>
                <FileText className="w-4 h-4 mr-2" />
                ログ/Cron
              </Button>
              <Button size="sm" variant="outline" onClick={() => onBackup(s)}>
                <Database className="w-4 h-4 mr-2" />
                バックアップ
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={s.siteId ? `/deploy/${s.id}/edit` : `/servers/${s.id}/edit`}>
                  <Pencil className="w-4 h-4 mr-2" />
                  編集
                </Link>
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function ServersPage() {
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [securityServer, setSecurityServer] = useState<ServerSummary | null>(null);
  const [maintenanceServer, setMaintenanceServer] = useState<ServerSummary | null>(null);
  const [opsServer, setOpsServer] = useState<ServerSummary | null>(null);
  const [backupServer, setBackupServer] = useState<ServerSummary | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      setServers(data.servers || []);
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const runCheck = async (id: string) => {
    setChecking(id);
    try {
      const res = await fetch(`/api/servers/${id}/health`, { method: "POST" });
      const data = await res.json();
      if (data.health) {
        setServers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, health: data.health } : s))
        );
      }
    } catch (error) {
      console.error("Health check failed:", error);
    } finally {
      setChecking(null);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    for (const s of servers) {
      await runCheck(s.id);
    }
    setCheckingAll(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setServers((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reordered = arrayMove(prev, oldIndex, newIndex);
        void fetch("/api/deploy-targets/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
        });
        return reordered;
      });
    },
    []
  );

  const criticalCount = servers.filter((s) => s.health?.overall === "critical").length;
  const warningCount = servers.filter((s) => s.health?.overall === "warning").length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">サーバー</h1>
          <p className="text-muted-foreground">接続先サーバーの監視・保守</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkAll} disabled={checkingAll || servers.length === 0}>
            <RefreshCw className={`w-4 h-4 mr-2 ${checkingAll ? "animate-spin" : ""}`} />
            すべてチェック
          </Button>
          <Button asChild>
            <Link href="/servers/new">
              <Plus className="w-4 h-4 mr-2" />
              サーバー追加
            </Link>
          </Button>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{servers.length}</div>
            <p className="text-sm text-muted-foreground">監視対象サーバー</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
            <p className="text-sm text-muted-foreground">警告</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-sm text-muted-foreground">重大</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">サーバー情報を取得中...</p>
          </CardContent>
        </Card>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">保守対象サーバーがありません</h3>
            <p className="text-muted-foreground mb-4">
              保守するサーバーを追加すると、監視・セキュリティチェック・バックアップが利用できます
            </p>
            <Button asChild>
              <Link href="/servers/new">
                <Plus className="w-4 h-4 mr-2" />
                サーバー追加
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              ローカルサイトに紐付ける場合は{" "}
              <Link href="/deploy" className="underline hover:text-foreground">
                デプロイ設定
              </Link>{" "}
              から追加できます
            </p>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          id="server-list"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={servers.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {servers.map((s) => (
                <SortableServerRow
                  key={s.id}
                  s={s}
                  checking={checking === s.id}
                  onCheck={runCheck}
                  onSecurity={setSecurityServer}
                  onMaintenance={setMaintenanceServer}
                  onOps={setOpsServer}
                  onBackup={setBackupServer}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {securityServer && (
        <ServerSecurityDialog
          serverId={securityServer.id}
          serverName={securityServer.name}
          open={!!securityServer}
          onOpenChange={(o) => !o && setSecurityServer(null)}
        />
      )}

      {maintenanceServer && (
        <ServerMaintenanceDialog
          serverId={maintenanceServer.id}
          serverName={maintenanceServer.name}
          open={!!maintenanceServer}
          onOpenChange={(o) => !o && setMaintenanceServer(null)}
        />
      )}

      {opsServer && (
        <ServerOpsDialog
          serverId={opsServer.id}
          serverName={opsServer.name}
          open={!!opsServer}
          onOpenChange={(o) => !o && setOpsServer(null)}
        />
      )}

      {backupServer && (
        <ServerBackupDialog
          serverId={backupServer.id}
          serverName={backupServer.name}
          open={!!backupServer}
          onOpenChange={(o) => !o && setBackupServer(null)}
        />
      )}
    </div>
  );
}
