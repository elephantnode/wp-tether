"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
  Code2,
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
  ChevronDown,
  RefreshCw,
} from "lucide-react";

import type { SiteCardProps } from "./types";
import { CommandList } from "./command-list";
import { SecurityScanDialog } from "./security-scan-dialog";
import { TunnelDialog } from "./tunnel-dialog";
import { DeleteSiteDialog } from "./delete-site-dialog";
import { SwitchVersionDialog } from "./switch-version-dialog";
import {
  useClipboard,
  useSiteActions,
  useTunnel,
  useSecurityScan,
} from "./hooks";

export type { SiteInfo, SiteCardProps } from "./types";

export function SiteCard({ site, dragHandle }: SiteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // バージョン切り替え後にローカルで反映
  const [displayWpVersion, setDisplayWpVersion] = useState(site.wpVersion);
  const [displayPhpVersion, setDisplayPhpVersion] = useState(site.phpVersion);
  const [showSwitchVersionDialog, setShowSwitchVersionDialog] = useState(false);
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
    openEditor,
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

  const siteUrl =
    site.hostnameMode === "localhost"
      ? `http://localhost:${site.port}`
      : `https://${site.hostname}`;
  const adminUrl =
    site.hostnameMode === "localhost"
      ? `http://localhost:${site.port}/wp-admin/`
      : `http://${site.hostname}/wp-admin/`;
  const networkUrl =
    site.hostnameMode === "localhost"
      ? `http://localhost:${site.port}/wp-admin/network/`
      : `http://${site.hostname}/wp-admin/network/`;
  const displayHost =
    site.hostnameMode === "localhost"
      ? `localhost:${site.port}`
      : site.hostname;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      {/* Collapsed row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {dragHandle}
        <Badge
          variant={isRunning ? "default" : "secondary"}
          className={`shrink-0 text-xs ${isRunning ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
        >
          {isRunning ? "● Running" : "○ Stopped"}
        </Badge>

        <span className="font-medium w-36 shrink-0 truncate">{site.name}</span>

        <span className="text-sm text-muted-foreground flex-1 truncate hidden sm:block">
          {displayHost}
        </span>

        <span className="text-xs text-muted-foreground shrink-0 hidden lg:block whitespace-nowrap">
          WP {displayWpVersion} / PHP {displayPhpVersion} / {site.dbType}
        </span>

        {/* Quick start/stop — stop propagation so row doesn't toggle */}
        <div onClick={(e) => e.stopPropagation()}>
          {isRunning ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStop}
              disabled={isLoading}
              title="停止"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStart}
              disabled={isLoading || isDeleting}
              title="起動"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Expanded content */}
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-3 border-t bg-muted/20 space-y-4">
          {/* Info rows */}
          <div className="text-sm space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="w-4 h-4 shrink-0" />
              {site.hostnameMode === "localhost" ? (
                <a
                  href={`http://localhost:${site.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  http://localhost:{site.port}
                </a>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  <a
                    href={`http://${site.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    http://{site.hostname}
                  </a>
                  <a
                    href={`https://${site.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    https://{site.hostname}
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-muted-foreground">
              <Folder className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 min-w-0">
                <span
                  className="truncate text-xs font-mono"
                  title={site.path}
                >
                  {site.path}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyPath(site.path)}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs hover:bg-muted rounded"
                    title="パスをコピー"
                  >
                    {isPathCopied(site.path) ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>コピー</span>
                  </button>
                  <button
                    onClick={openTerminal}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs hover:bg-muted rounded"
                    title="ターミナルで開く"
                  >
                    <Terminal className="w-3 h-3" />
                    <span>ターミナル</span>
                  </button>
                  <button
                    onClick={openEditor}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs hover:bg-muted rounded"
                    title="エディタで開く"
                  >
                    <Code2 className="w-3 h-3" />
                    <span>エディタ</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
              <Server className="w-4 h-4 shrink-0" />
              <span>
                WP {displayWpVersion} / PHP {displayPhpVersion} / {site.dbType}
              </span>
              {site.multisite?.enabled && (
                <Badge
                  variant="outline"
                  className="text-blue-600 border-blue-600 text-xs"
                >
                  Multisite /{" "}
                  {site.multisite.type === "subdomain"
                    ? "サブドメイン"
                    : "サブディレクトリ"}
                </Badge>
              )}
            </div>

            {site.admin && (
              <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
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
                onClick={(e) => e.stopPropagation()}
                title="Mailpit（メールテスト用 WebUI）"
              >
                Mailpit (localhost:{site.port + 1000})
              </a>
            </div>
          </div>

          <CommandList sitePath={site.path} />

          {displayError && (
            <p className="text-destructive text-xs">{displayError}</p>
          )}
          {pluginResult && (
            <p
              className={`text-xs ${
                pluginResult.type === "success"
                  ? "text-green-600"
                  : "text-destructive"
              }`}
            >
              {pluginResult.text}
            </p>
          )}

          {/* Action buttons */}
          <div
            className="flex flex-wrap gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {isRunning ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    サイト
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="WordPress管理画面"
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    管理画面
                  </a>
                </Button>
                {site.multisite?.enabled && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={networkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WordPress ネットワーク管理画面"
                    >
                      <Globe className="w-4 h-4 mr-1" />
                      ネットワーク管理
                    </a>
                  </Button>
                )}
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
                      <AlertDialogTitle>
                        プラグインをインストールしますか？
                      </AlertDialogTitle>
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
                  onClick={() => setShowSwitchVersionDialog(true)}
                  title="PHP / WordPress バージョンを切り替え"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  バージョン
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSwitchVersionDialog(true)}
                  title="PHP / WordPress バージョンを切り替え"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  バージョン
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
          </div>
        </div>
      </CollapsibleContent>

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
        <div className="px-4 pb-2">
          <p className="text-xs text-destructive">{tunnelError}</p>
        </div>
      )}

      <SwitchVersionDialog
        site={{ ...site, wpVersion: displayWpVersion, phpVersion: displayPhpVersion }}
        open={showSwitchVersionDialog}
        onOpenChange={setShowSwitchVersionDialog}
        onSwitched={(wp, php) => {
          setDisplayWpVersion(wp);
          setDisplayPhpVersion(php);
          setShowSwitchVersionDialog(false);
        }}
      />
    </Collapsible>
  );
}
