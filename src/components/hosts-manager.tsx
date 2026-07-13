"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Globe,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  FileText,
} from "lucide-react";

interface CustomSite {
  siteId: string;
  name: string;
  hostname: string;
  status: "running" | "stopped" | "creating" | "error";
}

interface HostsState {
  customSites: CustomSite[];
  applied: string[];
  enabled: string[];
  dirty: boolean;
  content: string;
  hostsPath: string;
  platform: string;
}

export function HostsManager() {
  const [state, setState] = useState<HostsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hosts");
      if (!res.ok) throw new Error("状態の取得に失敗しました");
      const data: HostsState = await res.json();
      setState(data);
    } catch {
      setMessage({ type: "error", text: "hosts の状態を取得できませんでした" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enabledSet = new Set(state?.enabled ?? []);

  const toggle = async (hostname: string, on: boolean) => {
    if (!state) return;
    const next = on
      ? Array.from(new Set([...state.enabled, hostname]))
      : state.enabled.filter((h) => h !== hostname);

    // 楽観的更新 + dirty 再計算
    const appliedSet = new Set(state.applied);
    const nextSet = new Set(next);
    const dirty =
      appliedSet.size !== nextSet.size ||
      [...nextSet].some((h) => !appliedSet.has(h));
    setState({ ...state, enabled: next, dirty });

    try {
      const res = await fetch("/api/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMessage({ type: "error", text: "設定の保存に失敗しました" });
      load();
    }
  };

  const apply = async () => {
    setApplying(true);
    setMessage({
      type: "info",
      text: "パスワードダイアログが表示されます。管理者パスワードを入力してください…",
    });
    try {
      const res = await fetch("/api/hosts/apply", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "/etc/hosts に反映しました" });
        await load();
      } else if (data.canceled) {
        setMessage({ type: "info", text: "キャンセルされました" });
      } else {
        setMessage({ type: "error", text: data.error || "反映に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "反映に失敗しました" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="size-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (!state) return null;

  const isMac = state.platform === "darwin";

  return (
    <div className="space-y-4">
      {!isMac && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <AlertCircle className="size-4 mt-0.5 shrink-0 text-amber-600" />
          <span>この機能は現在 macOS のみ対応しています。</span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>
          トグルで有効・無効を切り替え、「設定反映」で <code>/etc/hosts</code> に一括反映します。
          反映時に管理者パスワードの入力を求められます。既存の hosts エントリは保持されます。
        </span>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
            message.type === "success"
              ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
              : message.type === "error"
                ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
                : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-green-600" />
          ) : message.type === "error" ? (
            <AlertCircle className="size-4 shrink-0 text-red-600" />
          ) : (
            <Info className="size-4 shrink-0 text-blue-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {state.customSites.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>カスタムホスト名のサイトがありません</p>
          <p className="text-sm">
            サイト作成時に「カスタムホスト名」を選ぶと、ここに表示されます
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {state.customSites.map((site) => {
              const on = enabledSet.has(site.hostname);
              const inHosts = state.applied.includes(site.hostname);
              return (
                <div
                  key={site.siteId}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{site.name}</span>
                        <Badge
                          variant={
                            site.status === "running" ? "default" : "secondary"
                          }
                          className="shrink-0"
                        >
                          {site.status === "running" ? "起動中" : "停止中"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {site.hostname}
                        {inHosts && (
                          <span className="ml-2 text-xs text-green-600">
                            ● hosts 反映済み
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={on}
                    onCheckedChange={(v) => toggle(site.hostname, v)}
                    disabled={!isMac}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {state.dirty ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertCircle className="size-4" />
              未反映の変更があります
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-green-600" />
              最新の状態です
            </span>
          )}
        </div>
        <Button
          onClick={apply}
          disabled={applying || !isMac || !state.dirty}
          variant={state.dirty ? "default" : "outline"}
        >
          {applying ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          設定反映
        </Button>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">現在の {state.hostsPath} の内容</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap break-all">
            {state.content || "(空、または読み取れませんでした)"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
