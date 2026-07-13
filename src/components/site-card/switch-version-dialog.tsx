"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { useDockerVersions } from "@/hooks/use-docker-versions";
import type { SiteInfo } from "./types";

interface Props {
  site: SiteInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitched: (wpVersion: string, phpVersion: string) => void;
}

export function SwitchVersionDialog({ site, open, onOpenChange, onSwitched }: Props) {
  const { versions, isLoading: versionsLoading } = useDockerVersions();

  const [wpVersion, setWpVersion] = useState(site.wpVersion);
  const [phpVersion, setPhpVersion] = useState(site.phpVersion);
  const [switching, setSwitching] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const isChanged =
    wpVersion !== site.wpVersion || phpVersion !== site.phpVersion;

  const handleSwitch = async () => {
    setSwitching(true);
    setOutput("");
    setError("");

    try {
      const res = await fetch(`/api/sites/${site.id}/switch-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phpVersion, wordpressVersion: wpVersion }),
      });
      const data = await res.json();
      setOutput(data.output || "");
      if (!res.ok || !data.success) {
        setError(data.error || "切り替えに失敗しました");
      } else {
        onSwitched(data.wordpressVersion, data.phpVersion);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!switching) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            バージョン切り替え
          </DialogTitle>
          <DialogDescription>
            {site.name} の WordPress / PHP バージョンを変更します。
            コンテナを再起動しますが DB データは保持されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 現在のバージョン */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <span>現在:</span>
            <Badge variant="secondary">WP {site.wpVersion}</Badge>
            <Badge variant="secondary">PHP {site.phpVersion}</Badge>
          </div>

          {/* WordPress バージョン */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">WordPress バージョン</label>
            <Select
              value={wpVersion}
              onValueChange={setWpVersion}
              disabled={versionsLoading || switching}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.wordpress.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                    {v === site.wpVersion && " （現在）"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PHP バージョン */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">PHP バージョン</label>
            <Select
              value={phpVersion}
              onValueChange={setPhpVersion}
              disabled={versionsLoading || switching}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.php.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                    {v === site.phpVersion && " （現在）"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 変更後プレビュー */}
          {isChanged && (
            <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-md px-3 py-2">
              <span>変更後:</span>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                WP {wpVersion}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                PHP {phpVersion}
              </Badge>
            </div>
          )}

          {/* 実行ログ */}
          {output && (
            <pre className="text-xs font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all max-h-48 overflow-auto">
              {output}
            </pre>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* アクション */}
          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={switching}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSwitch}
              disabled={!isChanged || switching}
            >
              {switching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  切り替え中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  切り替え
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
