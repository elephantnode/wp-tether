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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Wrench, Terminal, Power } from "lucide-react";
import type {
  UpdatePreview,
  MaintenanceAction,
  MaintenanceResult,
  CoreUpdateOption,
} from "@/types";

const ACTION_LABELS: Record<MaintenanceAction, string> = {
  "update-all": "すべて更新（コア・プラグイン・テーマ・翻訳）",
  "update-core": "WordPress コアを更新",
  "update-plugins": "すべてのプラグインを更新",
  "update-themes": "すべてのテーマを更新",
  "update-translations": "翻訳を更新",
};

/** 確認ダイアログに渡す実行内容 */
interface PendingUpdate {
  action: MaintenanceAction;
  /** コア更新の対象指定（メジャー/マイナーの選択） */
  coreOption?: CoreUpdateOption;
  /** 確認ダイアログに出す説明 */
  label: string;
}

interface Props {
  serverId: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerMaintenanceDialog({ serverId, serverName, open, onOpenChange }: Props) {
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [createBackup, setCreateBackup] = useState(true);
  const [output, setOutput] = useState<string>("");
  const [wpCliCmd, setWpCliCmd] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingUpdate | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/maintenance`);
      const data = await res.json();
      if (data.preview) setPreview(data.preview);
      setMaintenanceMode(!!data.maintenanceMode);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (open) {
      setOutput("");
      fetchPreview();
    }
  }, [open, fetchPreview]);

  const post = async (body: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey);
    setOutput("");
    try {
      const res = await fetch(`/api/servers/${serverId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const result = data.result as MaintenanceResult | undefined;
      if (result) {
        setOutput(result.output || result.error || "");
      } else if (data.error) {
        setOutput(data.error);
      }
      await fetchPreview();
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "操作に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  // コア更新候補（マイナー / メジャー）。同時に出ることがある。
  const candidates = preview?.coreUpdate?.candidates ?? [];
  const minorCandidate = candidates.find((c) => c.updateType === "minor");
  const majorCandidate = candidates.find((c) => c.updateType === "major");

  const confirmUpdate = () => {
    if (!pendingAction) return;
    const { action, coreOption } = pendingAction;
    setPendingAction(null);
    post({ op: "update", action, createBackup, coreOption }, action);
  };

  const toggleMaintenance = () =>
    post({ op: "maintenance-mode", active: !maintenanceMode }, "maintenance-mode");

  const runWpCli = () => {
    if (!wpCliCmd.trim()) return;
    post({ op: "wp-cli", command: wpCliCmd }, "wp-cli");
  };

  const totalUpdates =
    (preview?.coreUpdate ? 1 : 0) +
    (preview?.plugins.length ?? 0) +
    (preview?.themes.length ?? 0) +
    (preview?.translations ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            {serverName} - メンテナンス
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* 更新プレビュー */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">更新プレビュー ({totalUpdates}件)</h3>
                <Button size="sm" variant="ghost" onClick={fetchPreview}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {preview && (
                <div className="text-sm space-y-1 mb-3">
                  {preview.coreUpdate && (
                    <div>
                      <Badge variant="destructive" className="mr-2">コア</Badge>
                      {preview.coreUpdate.current || "?"} →{" "}
                      {preview.coreUpdate.candidates.length > 1
                        ? preview.coreUpdate.candidates
                            .map(
                              (c) =>
                                `${c.version}${
                                  c.updateType === "major"
                                    ? "（メジャー）"
                                    : c.updateType === "minor"
                                      ? "（マイナー）"
                                      : ""
                                }`
                            )
                            .join(" / ")
                        : preview.coreUpdate.latest}
                    </div>
                  )}
                  {preview.plugins.length > 0 && (
                    <div>
                      <Badge variant="secondary" className="mr-2">プラグイン {preview.plugins.length}</Badge>
                      <span className="text-muted-foreground">
                        {preview.plugins.map((p) => `${p.name} (${p.currentVersion}→${p.newVersion})`).join(", ")}
                      </span>
                    </div>
                  )}
                  {preview.themes.length > 0 && (
                    <div>
                      <Badge variant="secondary" className="mr-2">テーマ {preview.themes.length}</Badge>
                      <span className="text-muted-foreground">
                        {preview.themes.map((t) => `${t.name} (${t.currentVersion}→${t.newVersion})`).join(", ")}
                      </span>
                    </div>
                  )}
                  {preview.translations > 0 && (
                    <div>
                      <Badge variant="secondary" className="mr-2">翻訳 {preview.translations}</Badge>
                    </div>
                  )}
                  {totalUpdates === 0 && (
                    <p className="text-muted-foreground">すべて最新です。</p>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm mb-2">
                <Checkbox
                  checked={createBackup}
                  onCheckedChange={(c) => setCreateBackup(!!c)}
                />
                更新前にDBバックアップを作成する
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setPendingAction({
                      action: "update-all",
                      label: ACTION_LABELS["update-all"],
                    })
                  }
                  disabled={!!busy}
                >
                  {busy === "update-all" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  すべて更新
                </Button>

                {/* マイナーとメジャーが同時にある場合のみボタンを分ける */}
                {minorCandidate && majorCandidate ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPendingAction({
                          action: "update-core",
                          coreOption: { version: minorCandidate.version },
                          label: `WordPress コアをマイナー更新（${preview?.coreUpdate?.current} → ${minorCandidate.version}）`,
                        })
                      }
                      disabled={!!busy}
                    >
                      コア: マイナー {minorCandidate.version}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setPendingAction({
                          action: "update-core",
                          coreOption: { version: majorCandidate.version },
                          label: `WordPress コアをメジャー更新（${preview?.coreUpdate?.current} → ${majorCandidate.version}）`,
                        })
                      }
                      disabled={!!busy}
                    >
                      コア: メジャー {majorCandidate.version}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPendingAction({
                        action: "update-core",
                        label: ACTION_LABELS["update-core"],
                      })
                    }
                    disabled={!!busy}
                  >
                    コア
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPendingAction({
                      action: "update-plugins",
                      label: ACTION_LABELS["update-plugins"],
                    })
                  }
                  disabled={!!busy}
                >
                  プラグイン
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPendingAction({
                      action: "update-themes",
                      label: ACTION_LABELS["update-themes"],
                    })
                  }
                  disabled={!!busy}
                >
                  テーマ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPendingAction({
                      action: "update-translations",
                      label: ACTION_LABELS["update-translations"],
                    })
                  }
                  disabled={!!busy}
                >
                  翻訳
                </Button>
              </div>

              {minorCandidate && majorCandidate && (
                <p className="text-xs text-muted-foreground mt-2">
                  「すべて更新」ではコアはマイナー（{minorCandidate.version}）までに留めます。
                  メジャー更新は上のボタンから個別に実行してください。
                </p>
              )}
            </section>

            {/* メンテナンスモード */}
            <section className="flex items-center justify-between border-t pt-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Power className="w-4 h-4" /> メンテナンスモード
                </h3>
                <p className="text-sm text-muted-foreground">
                  現在: {maintenanceMode ? "有効（サイト停止中）" : "無効"}
                </p>
              </div>
              <Button
                size="sm"
                variant={maintenanceMode ? "destructive" : "outline"}
                onClick={toggleMaintenance}
                disabled={!!busy}
              >
                {busy === "maintenance-mode" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {maintenanceMode ? "解除" : "有効化"}
              </Button>
            </section>

            {/* WP-CLI ランナー */}
            <section className="border-t pt-4">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4" /> WP-CLI コマンド
              </h3>
              <div className="flex gap-2">
                <div className="flex items-center px-2 bg-muted rounded-md text-sm font-mono">wp</div>
                <Input
                  value={wpCliCmd}
                  onChange={(e) => setWpCliCmd(e.target.value)}
                  placeholder="cache flush"
                  className="font-mono"
                  onKeyDown={(e) => e.key === "Enter" && runWpCli()}
                />
                <Button size="sm" onClick={runWpCli} disabled={!!busy || !wpCliCmd.trim()}>
                  {busy === "wp-cli" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  実行
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                定型例: <code>cache flush</code>, <code>rewrite flush</code>, <code>cron event run --due-now</code>
              </p>
            </section>

            {/* 出力 */}
            {output && (
              <section className="border-t pt-4">
                <h3 className="font-semibold mb-2">実行結果</h3>
                <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all max-h-64 overflow-auto">
                  {output}
                </pre>
              </section>
            )}
          </div>
        )}
      </DialogContent>

      {/* 更新の事前確認 */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>更新を実行しますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-foreground">{serverName}</span> に対して
                  「{pendingAction?.label ?? ""}」を実行します。
                </p>
                <p>
                  事前バックアップ:{" "}
                  {createBackup ? (
                    <span className="text-green-600">あり（更新前にDBをエクスポート）</span>
                  ) : (
                    <span className="text-red-500">なし</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  本番サイトに反映されます。実行中は数分かかる場合があります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdate}>実行する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
