"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Clock, Database, RefreshCw } from "lucide-react";
import type { RemoteLogResult, RemoteLogType, CronEvent, MaintenanceResult } from "@/types";

interface Props {
  serverId: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerOpsDialog({ serverId, serverName, open, onOpenChange }: Props) {
  const [logType, setLogType] = useState<RemoteLogType>("debug");
  const [log, setLog] = useState<RemoteLogResult | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [cron, setCron] = useState<CronEvent[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [cronLoading, setCronLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [opResult, setOpResult] = useState<string>("");

  const fetchLog = useCallback(
    async (type: RemoteLogType) => {
      setLogLoading(true);
      try {
        const res = await fetch(`/api/servers/${serverId}/logs?type=${type}&tail=300`);
        const data = await res.json();
        setLog(data.log ?? null);
      } catch {
        setLog(null);
      } finally {
        setLogLoading(false);
      }
    },
    [serverId]
  );

  const fetchCron = useCallback(async () => {
    setCronLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/cron`);
      const data = await res.json();
      setCron(data.events ?? []);
      setOverdue(data.overdueCount ?? 0);
    } catch {
      setCron([]);
    } finally {
      setCronLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (open) {
      setOpResult("");
      fetchLog("debug");
      fetchCron();
    }
  }, [open, fetchLog, fetchCron]);

  const switchLog = (type: RemoteLogType) => {
    setLogType(type);
    fetchLog(type);
  };

  const cronOp = async (op: string, busyKey: string) => {
    setBusy(busyKey);
    setOpResult("");
    try {
      const res = await fetch(`/api/servers/${serverId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op }),
      });
      const data = await res.json();
      const result = data.result as MaintenanceResult | undefined;
      setOpResult(result?.output || result?.error || data.error || "完了");
      if (op === "run-due") fetchCron();
    } catch (error) {
      setOpResult(error instanceof Error ? error.message : "操作に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{serverName} - ログ / Cron / バックアップ</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ログビューア */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" /> ログ
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={logType === "debug" ? "default" : "outline"}
                  onClick={() => switchLog("debug")}
                >
                  debug.log
                </Button>
                <Button
                  size="sm"
                  variant={logType === "php-error" ? "default" : "outline"}
                  onClick={() => switchLog("php-error")}
                >
                  PHP error
                </Button>
                <Button size="sm" variant="ghost" onClick={() => fetchLog(logType)}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {logLoading ? (
              <div className="py-6 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : log ? (
              <>
                {log.path && (
                  <p className="text-xs text-muted-foreground mb-1 font-mono">{log.path}</p>
                )}
                <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all max-h-64 overflow-auto">
                  {log.content || log.message || "ログがありません"}
                </pre>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">ログを取得できませんでした</p>
            )}
          </section>

          {/* Cron */}
          <section className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" /> WP-Cron
                {overdue > 0 && <Badge variant="destructive">遅延 {overdue}</Badge>}
              </h3>
              <Button size="sm" onClick={() => cronOp("run-due", "run-due")} disabled={!!busy}>
                {busy === "run-due" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                期限到来分を実行
              </Button>
            </div>
            {cronLoading ? (
              <div className="py-6 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : cron.length === 0 ? (
              <p className="text-sm text-muted-foreground">cron イベントがありません</p>
            ) : (
              <div className="max-h-48 overflow-auto border rounded-md divide-y">
                {cron.slice(0, 50).map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="font-mono truncate mr-2">{e.hook}</span>
                    <span className={`text-xs shrink-0 ${e.overdue ? "text-red-500" : "text-muted-foreground"}`}>
                      {e.nextRunRelative || e.nextRunGmt} {e.overdue ? "（遅延）" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* バックアップ */}
          <section className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Database className="w-4 h-4" /> DBバックアップ
                </h3>
                <p className="text-sm text-muted-foreground">
                  リモートのホーム配下に DB をエクスポート（最新5件保持）
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => cronOp("backup", "backup")} disabled={!!busy}>
                {busy === "backup" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                今すぐバックアップ
              </Button>
            </div>
          </section>

          {opResult && (
            <section className="border-t pt-4">
              <h3 className="font-semibold mb-2">実行結果</h3>
              <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all max-h-48 overflow-auto">
                {opResult}
              </pre>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
