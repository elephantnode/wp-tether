"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { SecurityScanResultWithCache } from "./hooks";

interface SecurityScanDialogProps {
  siteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isScanning: boolean;
  noCachedResult: boolean;
  securityResult: SecurityScanResultWithCache | null;
  onScan: (forceRefresh?: boolean) => void;
}

export function SecurityScanDialog({
  siteName,
  open,
  onOpenChange,
  isScanning,
  noCachedResult,
  securityResult,
  onScan,
}: SecurityScanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(95vw,42rem)] max-w-[95vw] flex-col gap-4 p-6 sm:rounded-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            セキュリティスキャン - {siteName}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {isScanning && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>スキャン中...</span>
            </div>
          )}
          {!isScanning && noCachedResult && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                スキャン結果がありません。再スキャンをクリックして実行してください。
              </p>
              <Button onClick={() => onScan(true)} disabled={isScanning}>
                <RefreshCw className="w-4 h-4 mr-2" />
                スキャン実行
              </Button>
            </div>
          )}
          {!isScanning && securityResult && (
            <SecurityScanResultContent
              securityResult={securityResult}
              isScanning={isScanning}
              onScan={onScan}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SecurityScanResultContentProps {
  securityResult: SecurityScanResultWithCache;
  isScanning: boolean;
  onScan: (forceRefresh?: boolean) => void;
}

function SecurityScanResultContent({
  securityResult,
  isScanning,
  onScan,
}: SecurityScanResultContentProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {securityResult.fromCache ? "キャッシュ結果: " : "スキャン日時: "}
          {new Date(securityResult.scannedAt).toLocaleString("ja-JP")}
          {securityResult.fromCache && (
            <span className="ml-1">（再スキャンするまで有効）</span>
          )}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onScan(true)}
          disabled={isScanning}
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
      <VersionSection securityResult={securityResult} />

      {/* ファイルスキャン */}
      <FileScanSection securityResult={securityResult} />

      {/* npm audit */}
      {securityResult.npmAudit && securityResult.npmAudit.length > 0 && (
        <NpmAuditSection npmAudit={securityResult.npmAudit} />
      )}

      {/* HTTPセキュリティヘッダ */}
      {securityResult.securityHeaders && (
        <SecurityHeadersSection securityHeaders={securityResult.securityHeaders} />
      )}

      {/* WordPress露出チェック */}
      {securityResult.exposureChecks && (
        <ExposureChecksSection exposureChecks={securityResult.exposureChecks} />
      )}

      {/* wp-config.php設定チェック */}
      {securityResult.wpConfigChecks && (
        <WpConfigChecksSection wpConfigChecks={securityResult.wpConfigChecks} />
      )}

      {/* WPVulnerability 脆弱性チェック */}
      {securityResult.vulnerabilityChecks &&
        securityResult.vulnerabilityChecks.length > 0 && (
          <VulnerabilityChecksSection
            vulnerabilityChecks={securityResult.vulnerabilityChecks}
          />
        )}

      {/* 推奨事項 */}
      {securityResult.recommendations.length > 0 && (
        <RecommendationsSection recommendations={securityResult.recommendations} />
      )}

      {/* 問題なしメッセージ */}
      {securityResult.recommendations.length === 0 &&
        securityResult.fileScan.issues.length === 0 &&
        !securityResult.versionSkippedReason &&
        (!securityResult.vulnerabilityChecks ||
          securityResult.vulnerabilityChecks.length === 0) &&
        (!securityResult.npmAudit || securityResult.npmAudit.length === 0) &&
        !securityResult.securityHeaders?.headers.some((h) => !h.present) &&
        !securityResult.exposureChecks?.items.some((i) => i.exposed) &&
        !securityResult.wpConfigChecks?.items.some((i) => i.hasIssue) && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            特記事項はありませんでした。
          </p>
        )}
    </>
  );
}

function VersionSection({
  securityResult,
}: {
  securityResult: SecurityScanResultWithCache;
}) {
  return (
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
          プラグイン: {securityResult.version.plugins.length} 件（有効{" "}
          {securityResult.version.plugins.filter((p) => p.status === "active").length} /
          無効{" "}
          {securityResult.version.plugins.filter((p) => p.status === "inactive").length}
          ）
        </li>
        <li>
          テーマ: {securityResult.version.themes.length} 件（有効{" "}
          {securityResult.version.themes.filter((t) => t.status === "active").length} /
          無効{" "}
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
  );
}

function FileScanSection({
  securityResult,
}: {
  securityResult: SecurityScanResultWithCache;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <p className="text-sm font-medium">ファイルスキャン</p>
      <p className="text-xs text-muted-foreground">
        {securityResult.fileScan.scannedDirs.join(", ")} →{" "}
        {securityResult.fileScan.filesScanned} ファイル
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
  );
}

function NpmAuditSection({
  npmAudit,
}: {
  npmAudit: NonNullable<SecurityScanResultWithCache["npmAudit"]>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">依存関係（npm audit）</p>
      <p className="text-xs text-muted-foreground">
        package.json があるテーマ・プラグインを対象に npm audit を実行しました。
      </p>
      <ul className="text-xs space-y-1.5 max-h-40 overflow-y-auto">
        {npmAudit.map((audit, idx) => (
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
                  <span className="text-muted-foreground">
                    low: {audit.vulnerabilities.low}
                  </span>
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
  );
}

function SecurityHeadersSection({
  securityHeaders,
}: {
  securityHeaders: NonNullable<SecurityScanResultWithCache["securityHeaders"]>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">HTTPセキュリティヘッダ</p>
      {securityHeaders.skippedReason ? (
        <p className="text-xs text-muted-foreground">{securityHeaders.skippedReason}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {securityHeaders.headers.filter((h) => h.present).length} /{" "}
            {securityHeaders.headers.length} 設定済み
          </p>
          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
            {securityHeaders.headers.map((header) => (
              <li
                key={header.name}
                className={`flex items-start gap-2 ${
                  header.present
                    ? "text-muted-foreground"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                <span className={`shrink-0 ${header.present ? "text-green-600" : ""}`}>
                  {header.present ? "✓" : "✗"}
                </span>
                <span>
                  <span className="font-mono">{header.name}</span>
                  {header.present && header.value && (
                    <span className="ml-1 text-[11px] break-all">
                      = {header.value.slice(0, 60)}
                      {header.value.length > 60 ? "…" : ""}
                    </span>
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
  );
}

function ExposureChecksSection({
  exposureChecks,
}: {
  exposureChecks: NonNullable<SecurityScanResultWithCache["exposureChecks"]>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">WordPress情報露出チェック</p>
      {exposureChecks.skippedReason ? (
        <p className="text-xs text-muted-foreground">{exposureChecks.skippedReason}</p>
      ) : (
        <>
          {exposureChecks.items.filter((i) => i.exposed).length > 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {exposureChecks.items.filter((i) => i.exposed).length} 件の露出を検出
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              チェックした項目に露出はありませんでした
            </p>
          )}
          <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {exposureChecks.items.map((item) => (
              <li
                key={item.id}
                className={`${
                  item.exposed
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                }`}
              >
                <span className={`mr-1 ${item.exposed ? "" : "text-green-600"}`}>
                  {item.exposed ? "⚠" : "✓"}
                </span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-1 font-mono text-[11px]">({item.path})</span>
                {item.exposed && item.detail && <span className="ml-1">— {item.detail}</span>}
                {item.exposed && (
                  <p className="mt-0.5 ml-4 text-[11px]">対策: {item.mitigation}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function WpConfigChecksSection({
  wpConfigChecks,
}: {
  wpConfigChecks: NonNullable<SecurityScanResultWithCache["wpConfigChecks"]>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">wp-config.php 設定</p>
      {wpConfigChecks.skippedReason ? (
        <p className="text-xs text-muted-foreground">{wpConfigChecks.skippedReason}</p>
      ) : (
        <>
          {wpConfigChecks.items.filter((i) => i.hasIssue).length > 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {wpConfigChecks.items.filter((i) => i.hasIssue).length} 件の設定を確認してください
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">問題のある設定はありませんでした</p>
          )}
          <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {wpConfigChecks.items.map((item) => (
              <li
                key={item.id}
                className={`${
                  item.hasIssue
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
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
  );
}

function VulnerabilityChecksSection({
  vulnerabilityChecks,
}: {
  vulnerabilityChecks: NonNullable<SecurityScanResultWithCache["vulnerabilityChecks"]>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm font-medium">既知の脆弱性（WPVulnerability）</p>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {vulnerabilityChecks.map((check, idx) => (
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
                  {v.affectedVersion && <span className="ml-1"> — {v.affectedVersion}</span>}
                  {v.description && <p className="mt-0.5 line-clamp-2">{v.description}</p>}
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
  );
}

function RecommendationsSection({
  recommendations,
}: {
  recommendations: SecurityScanResultWithCache["recommendations"];
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">推奨事項</p>
      <ul className="space-y-2">
        {recommendations.map((rec) => (
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
                <span className="block mt-1 text-xs">{rec.detail.join(", ")}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
