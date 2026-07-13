"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import type { RemoteSecurityScanResult, SecurityRecommendation } from "@/types";

interface Props {
  serverId: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function recBadge(level: SecurityRecommendation["level"]) {
  return level === "warning" ? (
    <Badge variant="destructive">要対応</Badge>
  ) : (
    <Badge variant="secondary">情報</Badge>
  );
}

export function ServerSecurityDialog({ serverId, serverName, open, onOpenChange }: Props) {
  const [result, setResult] = useState<RemoteSecurityScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const fetchCached = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/security`);
      const data = await res.json();
      setResult(data.result ?? null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (open) fetchCached();
  }, [open, fetchCached]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/security`, { method: "POST" });
      const data = await res.json();
      if (data.result) setResult(data.result);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setScanning(false);
    }
  };

  const warnings = result?.recommendations.filter((r) => r.level === "warning").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {warnings > 0 ? (
              <ShieldAlert className="w-5 h-5 text-red-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            )}
            {serverName} - セキュリティスキャン
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {result
              ? `最終スキャン: ${new Date(result.scannedAt).toLocaleString("ja-JP")}`
              : "まだスキャンしていません"}
          </p>
          <Button size="sm" onClick={runScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            スキャン実行
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : result ? (
          <div className="space-y-5 mt-2">
            {/* バージョン */}
            <section>
              <h3 className="font-semibold mb-1">バージョン</h3>
              {result.versionSkippedReason ? (
                <p className="text-sm text-muted-foreground">{result.versionSkippedReason}</p>
              ) : (
                <p className="text-sm">
                  WordPress {result.version.wordpress ?? "不明"} / PHP {result.version.php ?? "不明"} /
                  プラグイン {result.version.plugins.length} / テーマ {result.version.themes.length}
                </p>
              )}
            </section>

            {/* 整合性検証 */}
            <section>
              <h3 className="font-semibold mb-1">整合性検証（改ざん検出）</h3>
              <div className="text-sm space-y-1">
                <ChecksumLine label="コア" r={result.coreChecksum} />
                <ChecksumLine label="プラグイン" r={result.pluginChecksum} />
              </div>
            </section>

            {/* ファイル権限 */}
            <section>
              <h3 className="font-semibold mb-1">ファイル権限</h3>
              {result.filePermissions.checked ? (
                <p className="text-sm">
                  wp-config.php: {result.filePermissions.wpConfigPerms ?? "不明"}
                  {result.filePermissions.wpConfigTooOpen ? " ⚠️ 緩い" : ""} / world-writable:{" "}
                  {result.filePermissions.worldWritableCount ?? 0}件
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{result.filePermissions.skippedReason}</p>
              )}
            </section>

            {/* 脆弱性 / 露出 / ヘッダ */}
            <section>
              <h3 className="font-semibold mb-1">脆弱性・露出</h3>
              <p className="text-sm">
                既知の脆弱性: {result.vulnerabilityChecks.reduce((s, c) => s + c.vulnerabilities.length, 0)}件 /
                マルウェアパターン検出: {result.fileScan.issues.length}件 /
                露出項目:{" "}
                {result.exposureChecks?.items.filter((i) => i.exposed).length ?? 0}件 /
                未設定ヘッダ:{" "}
                {result.securityHeaders?.headers.filter((h) => !h.present).length ?? 0}件
              </p>
            </section>

            {/* 推奨事項 */}
            <section>
              <h3 className="font-semibold mb-2">推奨事項 ({result.recommendations.length})</h3>
              {result.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">問題は検出されませんでした。</p>
              ) : (
                <div className="space-y-2">
                  {result.recommendations.map((rec) => (
                    <div key={rec.id} className="border rounded-md p-3">
                      <div className="flex items-center gap-2 mb-1">
                        {recBadge(rec.level)}
                        <span className="font-medium text-sm">{rec.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.message}</p>
                      {rec.detail && rec.detail.length > 0 && (
                        <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                          {rec.detail.slice(0, 8).map((d, i) => (
                            <li key={i} className="font-mono break-all">
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground text-center">
            「スキャン実行」を押してセキュリティチェックを開始してください。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChecksumLine({
  label,
  r,
}: {
  label: string;
  r: { checked: boolean; skippedReason?: string; hasMismatch: boolean; mismatches: string[] };
}) {
  if (!r.checked) {
    return (
      <div className="text-muted-foreground">
        {label}: スキップ ({r.skippedReason})
      </div>
    );
  }
  return (
    <div>
      {label}:{" "}
      {r.hasMismatch ? (
        <span className="text-red-500">不一致 {r.mismatches.length}件 ⚠️</span>
      ) : (
        <span className="text-green-600">問題なし</span>
      )}
    </div>
  );
}
