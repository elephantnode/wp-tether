"use client";

import { useState, useCallback } from "react";
import { DeployTarget, DeployDirection, DeployScope, SyncMode } from "@/types";
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
  ChevronDown,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DeployTarget;
}

// アイテム選択をサポートするスコープ
const ITEM_SELECTABLE_SCOPES = new Set<DeployScope>(["themes", "plugins", "mu-plugins"]);

const SCOPES: { value: Exclude<DeployScope, "all" | "db">; label: string; description: string }[] = [
  { value: "themes", label: "テーマ", description: "wp-content/themes/" },
  { value: "plugins", label: "プラグイン", description: "wp-content/plugins/" },
  { value: "uploads", label: "アップロード", description: "wp-content/uploads/" },
  { value: "mu-plugins", label: "MUプラグイン", description: "wp-content/mu-plugins/" },
  { value: "languages", label: "言語ファイル", description: "wp-content/languages/" },
];

const SYNC_MODES: { value: SyncMode; label: string; description: string }[] = [
  { value: "mirror", label: "完全同期", description: "送信先を送信元と完全一致させる（不要ファイルは削除）" },
  { value: "additive", label: "追加・更新のみ", description: "新規・更新ファイルのみ転送（削除しない）" },
  { value: "update", label: "新しいもののみ", description: "送信先が新しいファイルはスキップ" },
];

/** スコープごとのアイテム選択状態 */
type ItemSelection =
  | { mode: "all" }
  | { mode: "selected"; items: Set<string> };

export function SyncDialog({ open, onOpenChange, target }: SyncDialogProps) {
  const [direction, setDirection] = useState<DeployDirection>("push");
  const [selectedScopes, setSelectedScopes] = useState<Set<DeployScope>>(new Set(["themes"]));
  const [syncMode, setSyncMode] = useState<SyncMode>("additive");
  const [dryRun, setDryRun] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    output: string;
  } | null>(null);

  // アイテム選択UI
  const [expandedScopes, setExpandedScopes] = useState<Set<DeployScope>>(new Set());
  const [loadingScopes, setLoadingScopes] = useState<Set<DeployScope>>(new Set());
  const [availableItems, setAvailableItems] = useState<Partial<Record<string, string[]>>>({});
  const [itemSelections, setItemSelections] = useState<Partial<Record<string, ItemSelection>>>({});

  function toggleScope(scope: DeployScope) {
    const newScopes = new Set(selectedScopes);
    if (newScopes.has(scope)) {
      newScopes.delete(scope);
      // スコープをオフにしたらアイテム選択もリセット
      setExpandedScopes((prev) => { const s = new Set(prev); s.delete(scope); return s; });
      setItemSelections((prev) => { const n = { ...prev }; delete n[scope]; return n; });
    } else {
      newScopes.add(scope);
    }
    setSelectedScopes(newScopes);
  }

  const fetchItems = useCallback(
    async (scope: DeployScope) => {
      if (!ITEM_SELECTABLE_SCOPES.has(scope)) return;
      setLoadingScopes((prev) => new Set(prev).add(scope));
      try {
        const source = direction === "push" ? "local" : "remote";
        const res = await fetch(
          `/api/sync/list?targetId=${target.id}&scope=${scope}&source=${source}`
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data.items)) {
          setAvailableItems((prev) => ({ ...prev, [scope]: data.items }));
        }
      } finally {
        setLoadingScopes((prev) => {
          const s = new Set(prev);
          s.delete(scope);
          return s;
        });
      }
    },
    [direction, target.id]
  );

  function toggleExpand(scope: DeployScope) {
    const isExpanding = !expandedScopes.has(scope);
    setExpandedScopes((prev) => {
      const s = new Set(prev);
      if (isExpanding) s.add(scope); else s.delete(scope);
      return s;
    });
    if (isExpanding && !availableItems[scope]) {
      fetchItems(scope);
    }
  }

  function toggleItem(scope: DeployScope, item: string) {
    setItemSelections((prev) => {
      const current = prev[scope];
      const items = new Set(
        current?.mode === "selected" ? current.items : availableItems[scope] ?? []
      );
      if (items.has(item)) {
        items.delete(item);
      } else {
        items.add(item);
      }
      // 全選択と同じなら "all" に戻す
      const all = availableItems[scope] ?? [];
      if (items.size === all.length) {
        return { ...prev, [scope]: { mode: "all" } };
      }
      return { ...prev, [scope]: { mode: "selected", items } };
    });
  }

  function selectAllItems(scope: DeployScope) {
    setItemSelections((prev) => ({ ...prev, [scope]: { mode: "all" } }));
  }

  function deselectAllItems(scope: DeployScope) {
    setItemSelections((prev) => ({
      ...prev,
      [scope]: { mode: "selected", items: new Set() },
    }));
  }

  function isItemChecked(scope: DeployScope, item: string): boolean {
    const sel = itemSelections[scope];
    if (!sel || sel.mode === "all") return true;
    return sel.items.has(item);
  }

  /** API に渡す selectedItems を構築 */
  function buildSelectedItems(): Partial<Record<string, string[]>> | undefined {
    const result: Partial<Record<string, string[]>> = {};
    let hasSelection = false;

    for (const scope of selectedScopes) {
      const sel = itemSelections[scope as string];
      if (sel?.mode === "selected" && sel.items.size > 0) {
        result[scope] = Array.from(sel.items);
        hasSelection = true;
      }
    }
    return hasSelection ? result : undefined;
  }

  /** スコープのサマリーテキスト */
  function getScopeSummary(scope: DeployScope): string | null {
    if (!ITEM_SELECTABLE_SCOPES.has(scope)) return null;
    const sel = itemSelections[scope as string];
    if (!sel || sel.mode === "all") {
      const count = availableItems[scope as string]?.length;
      return count != null ? `全${count}件` : null;
    }
    return `${sel.items.size}件を選択中`;
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
          mode: syncMode,
          selectedItems: buildSelectedItems(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, output: data.error || "同期に失敗しました" });
      } else {
        setResult({ success: data.success, output: data.output });
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

  // directionが変わったら取得済みアイテムをクリア
  function handleDirectionChange(dir: DeployDirection) {
    setDirection(dir);
    setAvailableItems({});
    setExpandedScopes(new Set());
    setItemSelections({});
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>ファイル同期 - {target.name}</DialogTitle>
          <DialogDescription>{target.vhost}</DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-6 py-4 overflow-y-auto flex-1 min-h-0">
            {/* 方向選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期方向</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={direction === "push" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => handleDirectionChange("push")}
                >
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Push（ローカル → リモート）
                </Button>
                <Button
                  type="button"
                  variant={direction === "pull" ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => handleDirectionChange("pull")}
                >
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Pull（リモート → ローカル）
                </Button>
              </div>
            </div>

            {/* スコープ選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期対象</Label>
              <div className="space-y-2">
                {SCOPES.map((scope) => {
                  const isSelected = selectedScopes.has(scope.value);
                  const isExpandable = ITEM_SELECTABLE_SCOPES.has(scope.value);
                  const isExpanded = expandedScopes.has(scope.value);
                  const isLoading = loadingScopes.has(scope.value);
                  const items = availableItems[scope.value];
                  const summary = isSelected ? getScopeSummary(scope.value) : null;

                  return (
                    <div key={scope.value} className="rounded-lg border overflow-hidden">
                      {/* スコープ行 */}
                      <div
                        className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleScope(scope.value)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleScope(scope.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Label className="cursor-pointer">{scope.label}</Label>
                            {summary && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {summary}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{scope.description}</p>
                        </div>
                        {/* アイテム選択ボタン */}
                        {isExpandable && isSelected && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(scope.value);
                            }}
                          >
                            <FolderOpen className="w-3 h-3" />
                            絞り込む
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* アイテム選択パネル */}
                      {isExpandable && isSelected && isExpanded && (
                        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
                          {isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>
                                {direction === "push" ? "ローカル" : "リモート"}から読み込み中...
                              </span>
                            </div>
                          ) : !items || items.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">
                              アイテムが見つかりません
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-muted-foreground">
                                  {direction === "push" ? "ローカル" : "リモート"}の{scope.label}
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => selectAllItems(scope.value)}
                                  >
                                    すべて選択
                                  </button>
                                  <span className="text-xs text-muted-foreground">|</span>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => deselectAllItems(scope.value)}
                                  >
                                    すべて解除
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                                {items.map((item) => (
                                  <label
                                    key={item}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={isItemChecked(scope.value, item)}
                                      onCheckedChange={() => toggleItem(scope.value, item)}
                                    />
                                    <span className="truncate font-mono text-xs">{item}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 同期モード選択 */}
            <div className="space-y-3">
              <Label className="text-base font-medium">同期モード</Label>
              <div className="grid grid-cols-1 gap-2">
                {SYNC_MODES.map((mode) => (
                  <div
                    key={mode.value}
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      syncMode === mode.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSyncMode(mode.value)}
                  >
                    <div className="mt-0.5">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          syncMode === mode.value
                            ? "border-primary"
                            : "border-muted-foreground"
                        }`}
                      >
                        {syncMode === mode.value && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="cursor-pointer font-medium">{mode.label}</Label>
                      <p className="text-xs text-muted-foreground">{mode.description}</p>
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
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div
              className={`flex items-center gap-2 ${
                result.success ? "text-green-600" : "text-destructive"
              }`}
            >
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
              <pre className="text-xs whitespace-pre-wrap font-mono">{result.output}</pre>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
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
