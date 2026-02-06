"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  ExternalLink,
  Play,
  Square,
  Trash2,
  Folder,
  Globe,
  Mail,
  Server,
  Loader2,
} from "lucide-react";

interface SiteCardProps {
  site: {
    id: string;
    name: string;
    status: "running" | "stopped" | "creating" | "error";
    hostname: string;
    path: string;
    port: number;
    wpVersion: string;
    phpVersion: string;
    dbType: string;
  };
}

export function SiteCard({ site }: SiteCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isRunning = site.status === "running";

  async function handleStart() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${site.id}/start`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "起動に失敗しました");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStop() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${site.id}/stop`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "停止に失敗しました");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFiles, deleteVolumes }),
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{site.name}</CardTitle>
          <Badge 
            variant={isRunning ? "default" : "secondary"}
            className={isRunning ? "bg-green-600 hover:bg-green-700 text-white" : ""}
          >
            {isRunning ? "● Running" : "○ Stopped"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <a
            href={`http://${site.hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-foreground"
          >
            http://{site.hostname}
          </a>
          <a
            href={`https://${site.hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-foreground"
          >
            https://{site.hostname}
          </a>
        </div>
      </CardHeader>

      <CardContent className="text-sm space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Globe className="w-4 h-4 shrink-0" />
          <a
            href={`http://${site.hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:underline hover:text-foreground"
            title={`http://${site.hostname}`}
          >
            {site.hostname}
          </a>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Folder className="w-4 h-4 shrink-0" />
          <a
            href={`file://${site.path}`}
            className="truncate hover:underline hover:text-foreground"
            title={site.path}
          >
            {site.path}
          </a>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Server className="w-4 h-4 shrink-0" />
          <span>
            WP {site.wpVersion} / PHP {site.phpVersion} / {site.dbType}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="w-4 h-4 shrink-0" />
          <a
            href={`http://localhost:${site.port + 1000}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-foreground"
            title="Mailpit（メールテスト用 WebUI）"
          >
            Mailpit (localhost:{site.port + 1000})
          </a>
        </div>

        {error && <p className="text-destructive text-xs mt-2">{error}</p>}
      </CardContent>

      <CardFooter className="gap-2">
        {isRunning ? (
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={`http://${site.hostname}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                HTTP
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`https://${site.hostname}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                HTTPS
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`http://localhost:${site.port + 1000}`} target="_blank" rel="noopener noreferrer" title="Mailpit">
                <Mail className="w-4 h-4 mr-1" />
                Mailpit
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStop}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-1" />
              )}
              {isLoading ? "停止中..." : "停止"}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStart}
              disabled={isLoading || isDeleting}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              {isLoading ? "起動中..." : "起動"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={isLoading || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-1" />
                  )}
                  {isDeleting ? "削除中..." : "削除"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>サイトを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{site.name}」を削除します。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-3 py-2">
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="deleteVolumes"
                      checked={deleteVolumes}
                      onCheckedChange={(checked: boolean) =>
                        setDeleteVolumes(checked)
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="deleteVolumes"
                        className="text-sm font-medium cursor-pointer block"
                      >
                        Dockerボリュームも削除する
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        データベースやCaddyの設定データが完全に削除されます。次回作成時に新しいデータベースが作成されます。
                      </p>
                      {deleteVolumes && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 font-medium">
                          ⚠️ 警告: この操作により、すべてのデータベースデータが失われます。
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="deleteFiles"
                      checked={deleteFiles}
                      onCheckedChange={(checked: boolean) =>
                        setDeleteFiles(checked)
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="deleteFiles"
                        className="text-sm font-medium cursor-pointer block"
                      >
                        ローカルファイルも削除する
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {site.path}
                      </p>
                    </div>
                  </div>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    削除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
