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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Share2,
  X,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Info,
  RefreshCw,
} from "lucide-react";
import type { SecurityScanResult } from "@/types";

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
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelProvider, setTunnelProvider] = useState<string | null>(null);
  const [isTunneling, setIsTunneling] = useState(false);
  const [showTunnelDialog, setShowTunnelDialog] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityResult, setSecurityResult] = useState<SecurityScanResult | null>(null);
  const [isSecurityScanning, setIsSecurityScanning] = useState(false);
  const [noCachedSecurityResult, setNoCachedSecurityResult] = useState(false);

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

  /** セキュリティダイアログを開き、前回結果を表示（キャッシュがなければ「結果なし」表示） */
  function openSecurityDialog() {
    setShowSecurityDialog(true);
    setSecurityResult(null);
    setNoCachedSecurityResult(false);
    runSecurityScan(false);
  }

  /** スキャン実行。forceRefresh=true のときのみ新規スキャン、否则はキャッシュ取得のみ */
  async function runSecurityScan(forceRefresh = false) {
    if (!showSecurityDialog && !forceRefresh) {
      setShowSecurityDialog(true);
    }
    if (!forceRefresh) {
      setSecurityResult(null);
      setNoCachedSecurityResult(false);
    }
    setIsSecurityScanning(true);
    try {
      const url = `/api/sites/${site.id}/security/scan${forceRefresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "スキャンに失敗しました");
        setShowSecurityDialog(false);
        return;
      }
      const data = await res.json();
      if (data.noCachedResult) {
        setNoCachedSecurityResult(true);
        setSecurityResult(null);
        setError(null);
      } else {
        setSecurityResult(data as SecurityScanResult & { fromCache?: boolean; cachedAt?: string });
        setNoCachedSecurityResult(false);
        setError(null);
      }
    } catch {
      setError("スキャンに失敗しました");
      setShowSecurityDialog(false);
    } finally {
      setIsSecurityScanning(false);
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

  async function openTerminal() {
    try {
      const res = await fetch("/api/open-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: site.path }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "ターミナルを開けませんでした");
      }
    } catch {
      setError("ターミナルを開けませんでした");
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

  async function handleStartTunnel() {
    setIsTunneling(true);
    setTunnelError(null);

    try {
      const res = await fetch(`/api/sites/${site.id}/tunnel`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "トンネルの開始に失敗しました");
      }

      if (data.tunnel?.publicUrl) {
        setTunnelUrl(data.tunnel.publicUrl);
        setTunnelProvider(data.tunnel.provider || null);
        setShowTunnelDialog(true);
      }
    } catch (err) {
      setTunnelError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsTunneling(false);
    }
  }

  async function handleStopTunnel() {
    try {
      await fetch(`/api/sites/${site.id}/tunnel`, {
        method: "DELETE",
      });
      setTunnelUrl(null);
      setTunnelProvider(null);
      setShowTunnelDialog(false);
    } catch {
      // エラーは無視
    }
  }

  async function copyTunnelUrl() {
    if (!tunnelUrl) return;
    try {
      await navigator.clipboard.writeText(tunnelUrl);
    } catch {
      // フォールバック
      const textarea = document.createElement("textarea");
      textarea.value = tunnelUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
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
            onClick={openTerminal}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            title="ターミナルで開く"
          >
            <Terminal className="w-3 h-3" />
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
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
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>プラグインをインストールしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    設定で登録したプリセットのプラグインを、このサイトに一括インストールして有効化します。既にインストール済みのプラグインはスキップされます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleInstallPlugins}>
                    インストール
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {tunnelUrl ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTunnelDialog(true)}
                className="text-green-600"
                title="公開URL・QRコードを表示"
              >
                <QrCode className="w-4 h-4 mr-1" />
                公開中
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartTunnel}
                disabled={isTunneling}
                title="一時的な公開URLを作成（Cloudflare Tunnel）"
              >
                {isTunneling ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Share2 className="w-4 h-4 mr-1" />
                )}
                {isTunneling ? "接続中..." : "公開"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={openSecurityDialog}
              disabled={isSecurityScanning}
              title="前回のスキャン結果を表示（再スキャンで更新）"
            >
              {isSecurityScanning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-1" />
              )}
              {isSecurityScanning ? "スキャン中..." : "セキュリティ"}
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
            <Button
              size="sm"
              variant="outline"
              onClick={openSecurityDialog}
              disabled={isSecurityScanning}
              title="前回のスキャン結果を表示（再スキャンで更新）"
            >
              {isSecurityScanning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-1" />
              )}
              {isSecurityScanning ? "スキャン中..." : "セキュリティ"}
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

      {/* セキュリティスキャンダイアログ */}
      <Dialog open={showSecurityDialog} onOpenChange={setShowSecurityDialog}>
        <DialogContent className="flex max-h-[90vh] w-[min(95vw,42rem)] max-w-[95vw] flex-col gap-4 p-6 sm:rounded-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              セキュリティスキャン - {site.name}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {isSecurityScanning && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>スキャン中...</span>
              </div>
            )}
            {!isSecurityScanning && noCachedSecurityResult && (
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  スキャン結果がありません。再スキャンをクリックして実行してください。
                </p>
                <Button onClick={() => runSecurityScan(true)} disabled={isSecurityScanning}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  スキャン実行
                </Button>
              </div>
            )}
            {!isSecurityScanning && securityResult && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {(securityResult as { fromCache?: boolean }).fromCache
                      ? "キャッシュ結果: "
                      : "スキャン日時: "}
                    {new Date(securityResult.scannedAt).toLocaleString("ja-JP")}
                    {(securityResult as { fromCache?: boolean }).fromCache && (
                      <span className="ml-1">（再スキャンするまで有効）</span>
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runSecurityScan(true)}
                    disabled={isSecurityScanning}
                    title="新規にスキャンを実行し、結果を更新する"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    再スキャン
                  </Button>
                </div>
                {securityResult.versionSkippedReason && (
                  <p className="text-sm text-amber-600 dark:text-amber-500 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {securityResult.versionSkippedReason}
                  </p>
                )}
                {/* バージョン情報 */}
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">バージョン</p>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {securityResult.version.wordpress != null && (
                      <li>WordPress: {securityResult.version.wordpress}</li>
                    )}
                    {securityResult.version.php != null && (
                      <li>PHP: {securityResult.version.php}</li>
                    )}
                    <li>
                      プラグイン: {securityResult.version.plugins.length} 件
                      （有効 {securityResult.version.plugins.filter((p) => p.status === "active").length} / 無効{" "}
                      {securityResult.version.plugins.filter((p) => p.status === "inactive").length}）
                    </li>
                    <li>
                      テーマ: {securityResult.version.themes.length} 件
                      （有効 {securityResult.version.themes.filter((t) => t.status === "active").length} / 無効{" "}
                      {securityResult.version.themes.filter((t) => t.status === "inactive").length}）
                    </li>
                  </ul>
                  {securityResult.version.plugins.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground">プラグイン一覧</p>
                      <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                        {securityResult.version.plugins.map((p) => (
                          <li key={p.name} className="flex justify-between gap-2">
                            <span className="truncate">
                              {p.name}{" "}
                              <span className="ml-1 text-[11px]">
                                ({p.status === "active" ? "有効" : "無効"})
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px]">
                              {p.version || "不明"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {securityResult.version.themes.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground">テーマ一覧</p>
                      <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                        {securityResult.version.themes.map((t) => (
                          <li key={t.name} className="flex justify-between gap-2">
                            <span className="truncate">
                              {t.name}{" "}
                              <span className="ml-1 text-[11px]">
                                ({t.status === "active" ? "有効" : "無効"})
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px]">
                              {t.version || "不明"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {/* ファイルスキャン */}
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-sm font-medium">ファイルスキャン</p>
                  <p className="text-xs text-muted-foreground">
                    {securityResult.fileScan.scannedDirs.join(", ")} → {securityResult.fileScan.filesScanned} ファイル
                    {securityResult.fileScan.issues.length > 0
                      ? ` / 要確認 ${securityResult.fileScan.issues.length} 件`
                      : " / 不審なパターンなし"}
                  </p>
                  {securityResult.fileScan.issues.length > 0 && (
                    <ul className="text-xs mt-2 max-h-64 overflow-y-auto space-y-1 break-all">
                      {securityResult.fileScan.issues.map((issue, i) => (
                        <li key={i} className="font-mono break-all" title={issue.snippet}>
                          {issue.path}
                          {issue.line != null ? `:${issue.line}` : ""} — {issue.pattern}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* npm audit */}
                {securityResult.npmAudit &&
                  securityResult.npmAudit.length > 0 && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-sm font-medium">依存関係（npm audit）</p>
                      <p className="text-xs text-muted-foreground">
                        package.json があるテーマ・プラグインを対象に npm audit を実行しました。
                      </p>
                      <ul className="text-xs space-y-1.5 max-h-40 overflow-y-auto">
                        {securityResult.npmAudit.map((audit, idx) => (
                          <li key={idx} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-mono break-all">{audit.projectPath}</span>
                            {audit.error ? (
                              <span className="text-amber-600 dark:text-amber-400">{audit.error}</span>
                            ) : (
                              <>
                                {audit.vulnerabilities.critical > 0 && (
                                  <span className="text-red-600 dark:text-red-400">
                                    critical: {audit.vulnerabilities.critical}
                                  </span>
                                )}
                                {audit.vulnerabilities.high > 0 && (
                                  <span className="text-orange-600 dark:text-orange-400">
                                    high: {audit.vulnerabilities.high}
                                  </span>
                                )}
                                {audit.vulnerabilities.moderate > 0 && (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    moderate: {audit.vulnerabilities.moderate}
                                  </span>
                                )}
                                {audit.vulnerabilities.low > 0 && (
                                  <span className="text-muted-foreground">low: {audit.vulnerabilities.low}</span>
                                )}
                                {audit.vulnerabilities.critical === 0 &&
                                  audit.vulnerabilities.high === 0 &&
                                  audit.vulnerabilities.moderate === 0 &&
                                  audit.vulnerabilities.low === 0 && (
                                    <span className="text-muted-foreground">脆弱性なし</span>
                                  )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                {/* HTTPセキュリティヘッダ */}
                {securityResult.securityHeaders && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">HTTPセキュリティヘッダ</p>
                    {securityResult.securityHeaders.skippedReason ? (
                      <p className="text-xs text-muted-foreground">
                        {securityResult.securityHeaders.skippedReason}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {securityResult.securityHeaders.headers.filter((h) => h.present).length} /{" "}
                          {securityResult.securityHeaders.headers.length} 設定済み
                        </p>
                        <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                          {securityResult.securityHeaders.headers.map((header) => (
                            <li
                              key={header.name}
                              className={`flex items-start gap-2 ${
                                header.present ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              <span className={`shrink-0 ${header.present ? "text-green-600" : ""}`}>
                                {header.present ? "✓" : "✗"}
                              </span>
                              <span>
                                <span className="font-mono">{header.name}</span>
                                {header.present && header.value && (
                                  <span className="ml-1 text-[11px] break-all">= {header.value.slice(0, 60)}{header.value.length > 60 ? "…" : ""}</span>
                                )}
                                {!header.present && (
                                  <span className="block text-[11px]">{header.description}</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {/* WordPress露出チェック */}
                {securityResult.exposureChecks && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">WordPress情報露出チェック</p>
                    {securityResult.exposureChecks.skippedReason ? (
                      <p className="text-xs text-muted-foreground">
                        {securityResult.exposureChecks.skippedReason}
                      </p>
                    ) : (
                      <>
                        {securityResult.exposureChecks.items.filter((i) => i.exposed).length > 0 ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {securityResult.exposureChecks.items.filter((i) => i.exposed).length} 件の露出を検出
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            チェックした項目に露出はありませんでした
                          </p>
                        )}
                        <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
                          {securityResult.exposureChecks.items.map((item) => (
                            <li
                              key={item.id}
                              className={`${
                                item.exposed ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                              }`}
                            >
                              <span className={`mr-1 ${item.exposed ? "" : "text-green-600"}`}>
                                {item.exposed ? "⚠" : "✓"}
                              </span>
                              <span className="font-medium">{item.name}</span>
                              <span className="ml-1 font-mono text-[11px]">({item.path})</span>
                              {item.exposed && item.detail && (
                                <span className="ml-1">— {item.detail}</span>
                              )}
                              {item.exposed && (
                                <p className="mt-0.5 ml-4 text-[11px]">
                                  対策: {item.mitigation}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {/* wp-config.php設定チェック */}
                {securityResult.wpConfigChecks && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">wp-config.php 設定</p>
                    {securityResult.wpConfigChecks.skippedReason ? (
                      <p className="text-xs text-muted-foreground">
                        {securityResult.wpConfigChecks.skippedReason}
                      </p>
                    ) : (
                      <>
                        {securityResult.wpConfigChecks.items.filter((i) => i.hasIssue).length > 0 ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {securityResult.wpConfigChecks.items.filter((i) => i.hasIssue).length} 件の設定を確認してください
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            問題のある設定はありませんでした
                          </p>
                        )}
                        <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
                          {securityResult.wpConfigChecks.items.map((item) => (
                            <li
                              key={item.id}
                              className={`${
                                item.hasIssue ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                              }`}
                            >
                              <span className={`mr-1 ${item.hasIssue ? "" : "text-green-600"}`}>
                                {item.hasIssue ? "⚠" : "✓"}
                              </span>
                              <span className="font-mono font-medium">{item.name}</span>
                              <span className="ml-1">= {item.currentValue || "未設定"}</span>
                              {item.hasIssue && (
                                <p className="mt-0.5 ml-4 text-[11px]">
                                  推奨: {item.recommendedValue} — {item.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {/* WPVulnerability 脆弱性チェック */}
                {securityResult.vulnerabilityChecks &&
                  securityResult.vulnerabilityChecks.length > 0 && (
                    <div className="rounded-lg border p-3 space-y-3">
                      <p className="text-sm font-medium">既知の脆弱性（WPVulnerability）</p>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {securityResult.vulnerabilityChecks.map((check, idx) => (
                          <div key={idx} className="text-sm">
                            <p className="font-medium text-amber-700 dark:text-amber-400">
                              {check.type === "core"
                                ? "WordPress"
                                : check.type === "plugin"
                                  ? `プラグイン: ${check.name}`
                                  : `テーマ: ${check.name}`}{" "}
                              （{check.installedVersion}） — {check.vulnerabilities.length} 件
                            </p>
                            <ul className="mt-1.5 space-y-1.5 pl-2 text-xs text-muted-foreground border-l-2 border-amber-200 dark:border-amber-800">
                              {check.vulnerabilities.slice(0, 5).map((v, i) => (
                                <li key={i}>
                                  {v.link ? (
                                    <a
                                      href={v.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      {v.name}
                                    </a>
                                  ) : (
                                    <span>{v.name}</span>
                                  )}
                                  {v.severity && (
                                    <span className="ml-1 text-amber-600 dark:text-amber-500">
                                      ({v.severity})
                                    </span>
                                  )}
                                  {v.affectedVersion && (
                                    <span className="ml-1"> — {v.affectedVersion}</span>
                                  )}
                                  {v.description && (
                                    <p className="mt-0.5 line-clamp-2">{v.description}</p>
                                  )}
                                </li>
                              ))}
                              {check.vulnerabilities.length > 5 && (
                                <li className="text-muted-foreground">
                                  …他 {check.vulnerabilities.length - 5} 件
                                </li>
                              )}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                {/* 推奨事項 */}
                {securityResult.recommendations.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">推奨事項</p>
                    <ul className="space-y-2">
                      {securityResult.recommendations.map((rec) => (
                        <li
                          key={rec.id}
                          className={`flex gap-2 text-sm ${
                            rec.level === "warning"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {rec.level === "warning" ? (
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          )}
                          <span>
                            <span className="font-medium">{rec.title}</span> — {rec.message}
                            {rec.detail && rec.detail.length > 0 && (
                              <span className="block mt-1 text-xs">
                                {rec.detail.join(", ")}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {securityResult.recommendations.length === 0 &&
                  securityResult.fileScan.issues.length === 0 &&
                  !securityResult.versionSkippedReason &&
                  (!securityResult.vulnerabilityChecks ||
                    securityResult.vulnerabilityChecks.length === 0) &&
                  (!securityResult.npmAudit || securityResult.npmAudit.length === 0) &&
                  (!securityResult.securityHeaders?.headers.some((h) => !h.present)) &&
                  (!securityResult.exposureChecks?.items.some((i) => i.exposed)) &&
                  (!securityResult.wpConfigChecks?.items.some((i) => i.hasIssue)) && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-600" />
                      特記事項はありませんでした。
                    </p>
                  )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* トンネルダイアログ */}
      <Dialog open={showTunnelDialog} onOpenChange={setShowTunnelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              公開URL - {site.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {tunnelUrl && (
              <>
                {/* QRコード */}
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qrcode?url=${encodeURIComponent(tunnelUrl)}`}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                </div>

                {/* URL */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tunnelUrl}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-muted rounded-md font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyTunnelUrl}
                    title="URLをコピー"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <a href={tunnelUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground text-center space-y-1">
                  {tunnelProvider && (
                    <p className="font-medium">
                      Provider: {tunnelProvider === "cloudflared" ? "Cloudflare Tunnel" : "ngrok"}
                    </p>
                  )}
                  <p>このURLはセッション中のみ有効です。ブラウザを閉じると無効になります。</p>
                </div>

                {/* 停止ボタン */}
                <Button
                  variant="outline"
                  onClick={handleStopTunnel}
                  className="w-full text-destructive"
                >
                  <X className="w-4 h-4 mr-2" />
                  公開を停止
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* トンネルエラー表示 */}
      {tunnelError && (
        <div className="px-4 pb-4">
          <p className="text-xs text-destructive">{tunnelError}</p>
        </div>
      )}
    </Card>
  );
}
