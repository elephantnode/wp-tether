"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeployTarget } from "@/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Server,
  Trash2,
  Loader2,
  ExternalLink,
  FolderSync,
  CheckCircle,
  XCircle,
  Wifi,
  Pencil,
  Database,
  Globe,
  LayoutDashboard,
} from "lucide-react";
import { SyncDialog } from "./sync-dialog";
import { DbSyncDialog } from "./db-sync-dialog";
import { RemoteDbRestoreDialog } from "./remote-db-restore-dialog";

interface DeployTargetCardProps {
  target: DeployTarget;
  sitePath: string;
  siteStatus: "running" | "stopped" | "creating" | "error";
}

export function DeployTargetCard({ target, sitePath, siteStatus }: DeployTargetCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showDbSyncDialog, setShowDbSyncDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = siteStatus === "running";

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/deploy-targets/${target.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setIsDeleting(false);
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/deploy-targets/${target.id}/test`, {
        method: "POST",
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        error: data.error,
      });
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "テストに失敗しました",
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{target.name}</CardTitle>
            <Badge variant="outline">{target.type.toUpperCase()}</Badge>
          </div>
          <div className="flex flex-col gap-1">
            <a
              href={target.vhost}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:underline hover:text-foreground flex items-center gap-1"
            >
              <Globe className="w-3 h-3 shrink-0" />
              <span className="truncate">{target.vhost}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
            <a
              href={`${target.vhost.replace(/\/$/, "")}/wp-admin/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:underline hover:text-foreground flex items-center gap-1"
            >
              <LayoutDashboard className="w-3 h-3 shrink-0" />
              <span className="truncate">管理画面</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="text-sm space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Server className="w-4 h-4 shrink-0" />
            <span className="truncate" title={target.wordpressPath}>
              {target.ssh?.host}:{target.ssh?.port} → {target.wordpressPath}
            </span>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 ${testResult.success ? "text-green-600" : "text-destructive"}`}>
              {testResult.success ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>接続成功</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span className="truncate">{testResult.error}</span>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-destructive text-xs">{error}</p>
          )}
        </CardContent>

        <CardFooter className="gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4 mr-1" />
            )}
            接続テスト
          </Button>

          <Button
            size="sm"
            onClick={() => setShowSyncDialog(true)}
          >
            <FolderSync className="w-4 h-4 mr-1" />
            ファイル
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDbSyncDialog(true)}
          >
            <Database className="w-4 h-4 mr-1" />
            DB
          </Button>

          <RemoteDbRestoreDialog
            targetId={target.id}
            targetName={target.name}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/deploy/${target.id}/edit`)}
          >
            <Pencil className="w-4 h-4 mr-1" />
            編集
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-1" />
                )}
                削除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>デプロイターゲットを削除</AlertDialogTitle>
                <AlertDialogDescription>
                  「{target.name}」を削除しますか？この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>

      <SyncDialog
        open={showSyncDialog}
        onOpenChange={setShowSyncDialog}
        target={target}
      />

      <DbSyncDialog
        open={showDbSyncDialog}
        onOpenChange={setShowDbSyncDialog}
        target={target}
      />
    </>
  );
}
