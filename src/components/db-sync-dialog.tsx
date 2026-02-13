"use client";

import { useState, useEffect } from "react";
import { DeployTarget, RemoteDbCapabilities } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowUpFromLine,
  ArrowDownToLine,
  CheckCircle,
  XCircle,
  Database,
  Users,
  Shield,
  AlertTriangle,
} from "lucide-react";

interface DbSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DeployTarget;
}

type Direction = "push" | "pull";

export function DbSyncDialog({ open, onOpenChange, target }: DbSyncDialogProps) {
  const [direction, setDirection] = useState<Direction>("pull");
  const [includeUsers, setIncludeUsers] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [capabilities, setCapabilities] = useState<RemoteDbCapabilities | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    output: string;
    backupPath?: string;
  } | null>(null);

  // ダイアログを開いた時にリモートの能力を検出
  useEffect(() => {
    if (open && !capabilities) {
      detectCapabilities();
    }
  }, [open]);

  async function detectCapabilities() {
    setIsDetecting(true);
    try {
      const res = await fetch(`/api/db-sync?targetId=${target.id}`);
      const data = await res.json();
      if (data.capabilities) {
        setCapabilities(data.capabilities);
      }
    } catch (error) {
      console.error("Failed to detect capabilities:", error);
    } finally {
      setIsDetecting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/db-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: target.id,
          direction,
          includeUsers,
          createBackup,
          dryRun,
        }),
      });

      const data = await res.json();

      setResult({
        success: data.success,
        output: data.output || data.error || "不明なエラー",
        backupPath: data.backupPath,
      });
    } catch (error) {
      setResult({
        success: false,
        output: error instanceof Error ? error.message : "エラーが発生しました",
      });
    } finally {
      setIsSyncing(false);
    }
  }

  function handleClose() {
    if (!isSyncing) {
      setResult(null);
      onOpenChange(false);
    }
  }

  function handleReset() {
    setResult(null);
    setDryRun(true);
  }

  // Push時にWP-CLIがない場合の警告
  const showPushWarning = direction === "push" && capabilities && !capabilities.hasWpCli;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            データベース同期 - {target.name}
          </DialogTitle>
          <DialogDescription>
            {target.vhost}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-6 py-4">
            {/* リモート能力表示 */}
            {isDetecting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                リモートサーバーを検出中...
              </div>
            ) : capabilities ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant={capabilities.hasWpCli ? "default" : "secondary"}>
                  WP-CLI: {capabilities.hasWpCli ? "利用可能" : "なし"}
                </Badge>
                <Badge variant={capabilities.hasMysqldump || capabilities.hasMariadbDump ? "default" : "secondary"}>
                  DB Dump: {capabilities.hasMariadbDump ? "mariadb-dump" : capabilities.hasMysqldump ? "mysqldump" : "なし"}
                </Badge>
                {capabilities.dbType !== "unknown" && (
                  <Badge variant="outline">
                    {capabilities.dbType === "mariadb" ? "MariaDB" : "MySQL"}
                  </Badge>
                )}
              </div>
            ) : null}

            {/* 方向選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期方向</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={direction === "pull" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => setDirection("pull")}
                >
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  <div className="text-left">
                    <div>Pull（リモート → ローカル）</div>
                    <div className="text-xs opacity-70 font-normal">
                      本番のDBをローカルに取り込む
                    </div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant={direction === "push" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => setDirection("push")}
                >
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  <div className="text-left">
                    <div>Push（ローカル → リモート）</div>
                    <div className="text-xs opacity-70 font-normal">
                      ローカルのDBを本番に反映
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Push時の警告 */}
            {showPushWarning && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    リモートにWP-CLIがありません
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Push後のURL置換（search-replace）が自動実行されません。
                    手動でwp search-replaceを実行するか、WP-CLIをインストールしてください。
                  </p>
                </div>
              </div>
            )}

            {/* オプション */}
            <div className="space-y-3">
              <Label className="text-base font-medium">オプション</Label>

              {/* ユーザーアカウント同期 */}
              <div
                className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                onClick={() => setIncludeUsers(!includeUsers)}
              >
                <Checkbox
                  checked={includeUsers}
                  onCheckedChange={(checked) => setIncludeUsers(checked === true)}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <Label className="cursor-pointer">ユーザーアカウントを含める</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    wp_users, wp_usermeta テーブルを同期に含めます
                  </p>
                </div>
              </div>

              {/* バックアップ作成 */}
              <div
                className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                onClick={() => setCreateBackup(!createBackup)}
              >
                <Checkbox
                  checked={createBackup}
                  onCheckedChange={(checked) => setCreateBackup(checked === true)}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <Label className="cursor-pointer">インポート前にバックアップを作成</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {direction === "pull"
                      ? "ローカルDBのバックアップを作成します"
                      : "リモートDBのバックアップを作成します"}
                  </p>
                </div>
              </div>
            </div>

            {/* Dry Run オプション */}
            <div className="flex items-center space-x-3 p-3 rounded-lg border bg-muted/30">
              <Checkbox
                id="dryRun"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="dryRun" className="cursor-pointer">
                  Dry Run（プレビュー）
                </Label>
                <p className="text-xs text-muted-foreground">
                  実際には同期せず、処理内容のプレビューのみ表示します
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className={`flex items-center gap-2 ${result.success ? "text-green-600" : "text-destructive"}`}>
              {result.success ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">
                    {dryRun ? "プレビュー完了" : "同期完了"}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">エラー</span>
                </>
              )}
            </div>

            {result.backupPath && (
              <div className="text-sm text-muted-foreground">
                バックアップ: {result.backupPath}
              </div>
            )}

            <div className="h-[300px] rounded-md border bg-muted/30 p-4 overflow-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {result.output}
              </pre>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSyncing}>
                キャンセル
              </Button>
              <Button
                onClick={handleSync}
                disabled={isSyncing || isDetecting}
              >
                {isSyncing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {dryRun ? "プレビュー実行" : "同期実行"}
              </Button>
            </>
          ) : (
            <>
              {result.success && dryRun && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDryRun(false);
                    setResult(null);
                  }}
                >
                  本番実行へ進む
                </Button>
              )}
              {!result.success && (
                <Button variant="outline" onClick={handleReset}>
                  やり直す
                </Button>
              )}
              <Button onClick={handleClose}>閉じる</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
