"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Database, RotateCcw, Trash2, Download } from "lucide-react";
import type {
  BackupGeneration,
  BackupFileScope,
  LocalBackupResult,
  SyncMode,
} from "@/types";

interface Props {
  serverId: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FILE_SCOPES: BackupFileScope[] = ["uploads", "plugins", "themes", "languages"];

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function ServerBackupDialog({ serverId, serverName, open, onOpenChange }: Props) {
  const [generations, setGenerations] = useState<BackupGeneration[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");

  // 取得オプション
  const [scopes, setScopes] = useState<Set<BackupFileScope>>(new Set(FILE_SCOPES));
  const [includeWpConfig, setIncludeWpConfig] = useState(true);
  const [includeDb, setIncludeDb] = useState(true);
  const [excludeUsers, setExcludeUsers] = useState(false);

  // 復元確認
  const [restoreTarget, setRestoreTarget] = useState<BackupGeneration | null>(null);
  const [restoreMode, setRestoreMode] = useState<SyncMode>("additive");
  const [restoreDb, setRestoreDb] = useState(true);

  const fetchGenerations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/backup`);
      const data = await res.json();
      setGenerations(data.generations ?? []);
    } catch {
      setGenerations([]);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (open) {
      setOutput("");
      fetchGenerations();
    }
  }, [open, fetchGenerations]);

  const toggleScope = (scope: BackupFileScope) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const runBackup = async () => {
    setBusy(true);
    setOutput("");
    try {
      const res = await fetch(`/api/servers/${serverId}/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileScopes: Array.from(scopes),
          includeWpConfig,
          includeDb,
          excludeUsers,
        }),
      });
      const data = await res.json();
      const result = data.result as LocalBackupResult | undefined;
      setOutput(result?.output || result?.error || data.error || "");
      await fetchGenerations();
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "バックアップに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    const gen = restoreTarget;
    setRestoreTarget(null);
    setBusy(true);
    setOutput("");
    try {
      const res = await fetch(`/api/servers/${serverId}/backup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId: gen.id,
          fileScopes: gen.fileScopes,
          restoreDb: restoreDb && gen.hasDb,
          mode: restoreMode,
        }),
      });
      const data = await res.json();
      const result = data.result as LocalBackupResult | undefined;
      setOutput(result?.output || result?.error || data.error || "");
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "復元に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const deleteGeneration = async (genId: string) => {
    await fetch(`/api/servers/${serverId}/backup?generationId=${genId}`, { method: "DELETE" });
    await fetchGenerations();
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ja-JP");
    } catch {
      return iso;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            {serverName} - バックアップ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 取得オプション */}
          <section>
            <h3 className="font-semibold mb-2">バックアップ取得</h3>
            <div className="flex flex-wrap gap-3 mb-2">
              {FILE_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={scopes.has(scope)} onCheckedChange={() => toggleScope(scope)} />
                  {scope}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeWpConfig} onCheckedChange={(c) => setIncludeWpConfig(!!c)} />
                wp-config.php
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeDb} onCheckedChange={(c) => setIncludeDb(!!c)} />
                データベース
              </label>
              {includeDb && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={excludeUsers} onCheckedChange={(c) => setExcludeUsers(!!c)} />
                  ユーザーテーブルを除外
                </label>
              )}
            </div>
            <Button size="sm" onClick={runBackup} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              バックアップ取得
            </Button>
          </section>

          {/* 世代一覧 */}
          <section className="border-t pt-4">
            <h3 className="font-semibold mb-2">保存済み世代（最大7件保持）</h3>
            {loading ? (
              <div className="py-6 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : generations.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだバックアップがありません。</p>
            ) : (
              <div className="border rounded-md divide-y">
                {generations.map((gen) => (
                  <div key={gen.id} className="flex items-center justify-between px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{formatDate(gen.createdAt)}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {gen.fileScopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                        {gen.hasWpConfig && <Badge variant="secondary" className="text-xs">wp-config</Badge>}
                        {gen.hasDb && <Badge variant="secondary" className="text-xs">DB</Badge>}
                        <span className="text-xs text-muted-foreground ml-1">{formatBytes(gen.totalBytes)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRestoreDb(gen.hasDb);
                          setRestoreTarget(gen);
                        }}
                        disabled={busy}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        復元
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteGeneration(gen.id)} disabled={busy}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {output && (
            <section className="border-t pt-4">
              <h3 className="font-semibold mb-2">実行結果</h3>
              <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all max-h-64 overflow-auto">
                {output}
              </pre>
            </section>
          )}
        </div>
      </DialogContent>

      {/* 復元の確認 */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>このバックアップから復元しますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-foreground">{serverName}</span> の本番環境に
                  {restoreTarget ? `（${formatDate(restoreTarget.createdAt)}）` : ""}
                  のバックアップを書き戻します。
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={restoreMode === "mirror"}
                      onCheckedChange={(c) => setRestoreMode(c ? "mirror" : "additive")}
                    />
                    ミラー復元（リモート側の余分なファイルを削除）
                  </label>
                  {restoreTarget?.hasDb && (
                    <label className="flex items-center gap-2">
                      <Checkbox checked={restoreDb} onCheckedChange={(c) => setRestoreDb(!!c)} />
                      データベースも復元する
                    </label>
                  )}
                </div>
                <p className="text-red-500">この操作は元に戻せません。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>復元する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
