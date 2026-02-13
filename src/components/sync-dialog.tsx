"use client";

import { useState } from "react";
import { DeployTarget, DeployDirection, DeployScope } from "@/types";
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
import {
  Loader2,
  ArrowUpFromLine,
  ArrowDownToLine,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DeployTarget;
}

const SCOPES: { value: Exclude<DeployScope, "all" | "db">; label: string; description: string }[] = [
  { value: "themes", label: "テーマ", description: "wp-content/themes/" },
  { value: "plugins", label: "プラグイン", description: "wp-content/plugins/" },
  { value: "uploads", label: "アップロード", description: "wp-content/uploads/" },
  { value: "mu-plugins", label: "MUプラグイン", description: "wp-content/mu-plugins/" },
  { value: "languages", label: "言語ファイル", description: "wp-content/languages/" },
];

export function SyncDialog({ open, onOpenChange, target }: SyncDialogProps) {
  const [direction, setDirection] = useState<DeployDirection>("push");
  const [selectedScopes, setSelectedScopes] = useState<Set<DeployScope>>(new Set(["themes"]));
  const [dryRun, setDryRun] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    output: string;
  } | null>(null);

  function toggleScope(scope: DeployScope) {
    const newScopes = new Set(selectedScopes);
    if (newScopes.has(scope)) {
      newScopes.delete(scope);
    } else {
      newScopes.add(scope);
    }
    setSelectedScopes(newScopes);
  }

  async function handleSync() {
    setIsSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: target.id,
          direction,
          scopes: Array.from(selectedScopes),
          dryRun,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          success: false,
          output: data.error || "同期に失敗しました",
        });
      } else {
        setResult({
          success: data.success,
          output: data.output,
        });
      }
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ファイル同期 - {target.name}</DialogTitle>
          <DialogDescription>
            {target.vhost}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-6 py-4">
            {/* 方向選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期方向</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={direction === "push" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => setDirection("push")}
                >
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Push（ローカル → リモート）
                </Button>
                <Button
                  type="button"
                  variant={direction === "pull" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => setDirection("pull")}
                >
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Pull（リモート → ローカル）
                </Button>
              </div>
            </div>

            {/* スコープ選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期対象</Label>
              <div className="grid grid-cols-2 gap-3">
                {SCOPES.map((scope) => (
                  <div
                    key={scope.value}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleScope(scope.value)}
                  >
                    <Checkbox
                      checked={selectedScopes.has(scope.value)}
                      onCheckedChange={() => toggleScope(scope.value)}
                    />
                    <div className="space-y-1">
                      <Label className="cursor-pointer">{scope.label}</Label>
                      <p className="text-xs text-muted-foreground">{scope.description}</p>
                    </div>
                  </div>
                ))}
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
                  実際には同期せず、変更内容のプレビューのみ表示します
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
                disabled={isSyncing || selectedScopes.size === 0}
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
              <Button onClick={handleClose}>閉じる</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
