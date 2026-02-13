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
import { DbRestoreDialog } from "@/components/db-restore-dialog";
import {
  ExternalLink,
  Play,
  Square,
  Trash2,
  Folder,
  FolderOpen,
  Globe,
  Mail,
  Server,
  Loader2,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  User,
  Key,
  Settings,
  Package,
} from "lucide-react";

interface SiteCardProps {
  site: {
    id: string;
    name: string;
    status: "running" | "stopped" | "creating" | "error";
    hostname: string;
    hostnameMode?: "localhost" | "custom";
    path: string;
    port: number;
    wpVersion: string;
    phpVersion: string;
    dbType: string;
    /** WordPress管理者情報（オプション） */
    admin?: {
      user: string;
      password: string;
      email: string;
    };
  };
}

export function SiteCard({ site }: SiteCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isInstallingPlugins, setIsInstallingPlugins] = useState(false);
  const [pluginResult, setPluginResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isRunning = site.status === "running";

  // コマンドリスト
  const commands = [
    {
      category: "WP-CLI",
      items: [
        { label: "プラグイン一覧", cmd: "docker compose run --rm wpcli plugin list" },
        { label: "プラグインインストール", cmd: "docker compose run --rm wpcli plugin install <plugin-name> --activate" },
        { label: "テーマ一覧", cmd: "docker compose run --rm wpcli theme list" },
        { label: "ユーザー一覧", cmd: "docker compose run --rm wpcli user list" },
        { label: "DBエクスポート", cmd: "docker compose run --rm wpcli db export - > backup.sql" },
        { label: "DBインポート", cmd: "docker compose run --rm wpcli db import - < backup.sql" },
        { label: "キャッシュクリア", cmd: "docker compose run --rm wpcli cache flush" },
        { label: "検索置換", cmd: "docker compose run --rm wpcli search-replace 'old' 'new'" },
      ],
    },
    {
      category: "Composer",
      items: [
        { label: "パッケージインストール", cmd: "docker compose run --rm composer require <vendor/package>" },
        { label: "依存関係インストール", cmd: "docker compose run --rm composer install" },
        { label: "依存関係更新", cmd: "docker compose run --rm composer update" },
      ],
    },
    {
      category: "Docker",
      items: [
        { label: "ログ確認", cmd: "docker compose logs -f" },
        { label: "WPログ確認", cmd: "docker compose logs -f wordpress" },
        { label: "コンテナ状態", cmd: "docker compose ps" },
        { label: "再起動", cmd: "docker compose restart" },
      ],
    },
  ];

  async function copyToClipboard(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCommand(cmd);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch {
      // フォールバック
      const textarea = document.createElement("textarea");
      textarea.value = cmd;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedCommand(cmd);
      setTimeout(() => setCopiedCommand(null), 2000);
    }
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(site.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = site.path;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  }

  async function openFolder() {
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: site.path }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "フォルダを開けませんでした");
      }
    } catch {
      setError("フォルダを開けませんでした");
    }
  }

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

  async function handleInstallPlugins() {
    setIsInstallingPlugins(true);
    setPluginResult(null);
    setError(null);

    try {
      const res = await fetch("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "インストールに失敗しました");
      }

      setPluginResult({
        type: "success",
        text: `${data.plugins.length}個のプラグインをインストールしました`,
      });
    } catch (err) {
      setPluginResult({
        type: "error",
        text: err instanceof Error ? err.message : "エラーが発生しました",
      });
    } finally {
      setIsInstallingPlugins(false);
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
          {site.hostnameMode === "localhost" ? (
            <a
              href={`http://localhost:${site.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-foreground"
            >
              http://localhost:{site.port}
            </a>
          ) : (
            <>
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
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="text-sm space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Globe className="w-4 h-4 shrink-0" />
          {site.hostnameMode === "localhost" ? (
            <a
              href={`http://localhost:${site.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline hover:text-foreground"
              title={`http://localhost:${site.port}`}
            >
              localhost:{site.port}
            </a>
          ) : (
            <a
              href={`http://${site.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline hover:text-foreground"
              title={`http://${site.hostname}`}
            >
              {site.hostname}
            </a>
          )}
        </div>
        <div className="group flex items-center gap-2 text-muted-foreground">
          <Folder className="w-4 h-4 shrink-0" />
          <span
            className="truncate flex-1"
            title={site.path}
          >
            {site.path}
          </span>
          <button
            onClick={copyPath}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            title="パスをコピー"
          >
            {copiedPath ? (
              <Check className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={openFolder}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            title="フォルダを開く"
          >
            <FolderOpen className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Server className="w-4 h-4 shrink-0" />
          <span>
            WP {site.wpVersion} / PHP {site.phpVersion} / {site.dbType}
          </span>
        </div>
        {site.admin && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-4 h-4 shrink-0" />
            <span className="font-mono text-xs">
              {site.admin.user}
            </span>
            <Key className="w-4 h-4 shrink-0 ml-2" />
            <code className="font-mono text-xs bg-muted px-1 rounded select-all">
              {site.admin.password}
            </code>
          </div>
        )}
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

        {/* コマンドリスト */}
        <div className="pt-2 border-t mt-3">
          <button
            onClick={() => setShowCommands(!showCommands)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-full text-left"
          >
            <Terminal className="w-4 h-4 shrink-0" />
            <span className="flex-1">コマンドリスト</span>
            {showCommands ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showCommands && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                サイトディレクトリで実行: <code className="bg-muted px-1 rounded">{site.path}</code>
              </p>
              {commands.map((group) => (
                <div key={group.category}>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                    {group.category}
                  </h4>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.label}
                        className="group flex items-center gap-2 text-xs"
                      >
                        <span className="text-muted-foreground w-28 shrink-0">
                          {item.label}
                        </span>
                        <code className="flex-1 bg-muted px-2 py-1 rounded text-[11px] font-mono truncate">
                          {item.cmd}
                        </code>
                        <button
                          onClick={() => copyToClipboard(item.cmd)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                          title="コピー"
                        >
                          {copiedCommand === item.cmd ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-destructive text-xs mt-2">{error}</p>}
        {pluginResult && (
          <p
            className={`text-xs mt-2 ${
              pluginResult.type === "success" ? "text-green-600" : "text-destructive"
            }`}
          >
            {pluginResult.text}
          </p>
        )}
      </CardContent>

      <CardFooter className="gap-2 flex-wrap">
        {isRunning ? (
          <>
            <Button size="sm" variant="outline" asChild>
              <a
                href={site.hostnameMode === "localhost" ? `http://localhost:${site.port}` : `https://${site.hostname}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                サイト
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={site.hostnameMode === "localhost" ? `http://localhost:${site.port}/wp-admin/` : `http://${site.hostname}/wp-admin/`}
                target="_blank"
                rel="noopener noreferrer"
                title="WordPress管理画面"
              >
                <Settings className="w-4 h-4 mr-1" />
                管理画面
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
              onClick={handleInstallPlugins}
              disabled={isInstallingPlugins}
              title="プリセットのプラグインをインストール"
            >
              {isInstallingPlugins ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Package className="w-4 h-4 mr-1" />
              )}
              {isInstallingPlugins ? "インストール中..." : "プラグイン"}
            </Button>
            <DbRestoreDialog
              siteId={site.id}
              siteName={site.name}
            />
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
