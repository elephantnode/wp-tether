"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Database, Loader2, RotateCcw, AlertTriangle } from "lucide-react";

interface DbBackup {
  filename: string;
  createdAt: string;
  size: number;
}

interface DbRestoreDialogProps {
  siteId: string;
  siteName: string;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DbRestoreDialog({ siteId, siteName, disabled }: DbRestoreDialogProps) {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState<DbBackup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      fetchBackups();
    }
  }, [open]);

  async function fetchBackups() {
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/db-backups`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRestore() {
    if (!selectedBackup) return;

    setIsRestoring(true);
    setResult(null);

    try {
      const res = await fetch(`/api/sites/${siteId}/db-backups/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedBackup }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "復元に失敗しました");
      }

      setResult({
        type: "success",
        text: "データベースを復元しました",
      });
      setSelectedBackup(null);
    } catch (err) {
      setResult({
        type: "error",
        text: err instanceof Error ? err.message : "エラーが発生しました",
      });
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          title="DBバックアップから復元"
        >
          <Database className="w-4 h-4 mr-1" />
          DB復元
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            DB復元
          </DialogTitle>
          <DialogDescription>
            {siteName} のバックアップから復元します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              バックアップがありません
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {backups.map((backup) => (
                <label
                  key={backup.filename}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    selectedBackup === backup.filename
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="backup"
                    value={backup.filename}
                    checked={selectedBackup === backup.filename}
                    onChange={() => setSelectedBackup(backup.filename)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedBackup === backup.filename
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selectedBackup === backup.filename && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">
                      {backup.filename}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(backup.createdAt)} / {formatFileSize(backup.size)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedBackup && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                現在のデータベースは上書きされます。この操作は取り消せません。
              </span>
            </div>
          )}

          {result && (
            <div
              className={`p-3 rounded-md text-sm ${
                result.type === "success"
                  ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                  : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
              }`}
            >
              {result.text}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isRestoring}
            >
              閉じる
            </Button>
            <Button
              onClick={handleRestore}
              disabled={!selectedBackup || isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              {isRestoring ? "復元中..." : "復元する"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
