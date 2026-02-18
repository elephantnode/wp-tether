"use client";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Folder,
  FolderOpen,
  Globe,
  Mail,
  Server,
  Loader2,
  Terminal,
  Copy,
  Check,
  User,
  Key,
  Settings,
  Package,
  Share2,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import type { SiteCardProps } from "./types";
import { CommandList } from "./command-list";
import { SecurityScanDialog } from "./security-scan-dialog";
import { TunnelDialog } from "./tunnel-dialog";
import { DeleteSiteDialog } from "./delete-site-dialog";
import {
  useClipboard,
  useSiteActions,
  useTunnel,
  useSecurityScan,
} from "./hooks";

export type { SiteInfo, SiteCardProps } from "./types";

export function SiteCard({ site }: SiteCardProps) {
  const isRunning = site.status === "running";

  const { copy: copyPath, isCopied: isPathCopied } = useClipboard();

  const {
    isLoading,
    isDeleting,
    isInstallingPlugins,
    error,
    pluginResult,
    handleStart,
    handleStop,
    handleDelete,
    handleInstallPlugins,
    openFolder,
    openTerminal,
  } = useSiteActions({ siteId: site.id, sitePath: site.path });

  const {
    tunnelUrl,
    tunnelProvider,
    isTunneling,
    showTunnelDialog,
    setShowTunnelDialog,
    tunnelError,
    handleStartTunnel,
    handleStopTunnel,
    copyTunnelUrl,
  } = useTunnel({ siteId: site.id });

  const {
    showSecurityDialog,
    setShowSecurityDialog,
    securityResult,
    isSecurityScanning,
    noCachedSecurityResult,
    scanError,
    runSecurityScan,
    openSecurityDialog,
  } = useSecurityScan({ siteId: site.id });

  const displayError = error || scanError;

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
          <span className="truncate flex-1" title={site.path}>
            {site.path}
          </span>
          <button
            onClick={() => copyPath(site.path)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            title="パスをコピー"
          >
            {isPathCopied(site.path) ? (
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
            <span className="font-mono text-xs">{site.admin.user}</span>
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

        <CommandList sitePath={site.path} />

        {displayError && <p className="text-destructive text-xs mt-2">{displayError}</p>}
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
                href={
                  site.hostnameMode === "localhost"
                    ? `http://localhost:${site.port}`
                    : `https://${site.hostname}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                サイト
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={
                  site.hostnameMode === "localhost"
                    ? `http://localhost:${site.port}/wp-admin/`
                    : `http://${site.hostname}/wp-admin/`
                }
                target="_blank"
                rel="noopener noreferrer"
                title="WordPress管理画面"
              >
                <Settings className="w-4 h-4 mr-1" />
                管理画面
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={`http://localhost:${site.port + 1000}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Mailpit"
              >
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
            <DbRestoreDialog siteId={site.id} siteName={site.name} />
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
            <DeleteSiteDialog
              siteName={site.name}
              sitePath={site.path}
              isDeleting={isDeleting}
              isLoading={isLoading}
              onDelete={handleDelete}
            />
          </>
        )}
      </CardFooter>

      <SecurityScanDialog
        siteName={site.name}
        open={showSecurityDialog}
        onOpenChange={setShowSecurityDialog}
        isScanning={isSecurityScanning}
        noCachedResult={noCachedSecurityResult}
        securityResult={securityResult}
        onScan={runSecurityScan}
      />

      <TunnelDialog
        siteName={site.name}
        open={showTunnelDialog}
        onOpenChange={setShowTunnelDialog}
        tunnelUrl={tunnelUrl}
        tunnelProvider={tunnelProvider}
        onCopyUrl={copyTunnelUrl}
        onStop={handleStopTunnel}
      />

      {tunnelError && (
        <div className="px-4 pb-4">
          <p className="text-xs text-destructive">{tunnelError}</p>
        </div>
      )}
    </Card>
  );
}
