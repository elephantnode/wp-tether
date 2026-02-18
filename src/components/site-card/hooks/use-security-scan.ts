import { useState, useCallback } from "react";
import type { SecurityScanResult } from "@/types";

interface UseSecurityScanOptions {
  siteId: string;
}

export interface SecurityScanResultWithCache extends SecurityScanResult {
  fromCache?: boolean;
  cachedAt?: string;
}

export function useSecurityScan({ siteId }: UseSecurityScanOptions) {
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityResult, setSecurityResult] = useState<SecurityScanResultWithCache | null>(null);
  const [isSecurityScanning, setIsSecurityScanning] = useState(false);
  const [noCachedSecurityResult, setNoCachedSecurityResult] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const runSecurityScan = useCallback(
    async (forceRefresh = false) => {
      if (!showSecurityDialog && !forceRefresh) {
        setShowSecurityDialog(true);
      }
      if (!forceRefresh) {
        setSecurityResult(null);
        setNoCachedSecurityResult(false);
      }
      setIsSecurityScanning(true);
      setScanError(null);
      try {
        const url = `/api/sites/${siteId}/security/scan${forceRefresh ? "?refresh=1" : ""}`;
        const res = await fetch(url);
        if (!res.ok) {
          const data = await res.json();
          setScanError(data.error || "スキャンに失敗しました");
          setShowSecurityDialog(false);
          return;
        }
        const data = await res.json();
        if (data.noCachedResult) {
          setNoCachedSecurityResult(true);
          setSecurityResult(null);
        } else {
          setSecurityResult(data as SecurityScanResultWithCache);
          setNoCachedSecurityResult(false);
        }
      } catch {
        setScanError("スキャンに失敗しました");
        setShowSecurityDialog(false);
      } finally {
        setIsSecurityScanning(false);
      }
    },
    [siteId, showSecurityDialog]
  );

  const openSecurityDialog = useCallback(() => {
    setShowSecurityDialog(true);
    setSecurityResult(null);
    setNoCachedSecurityResult(false);
    runSecurityScan(false);
  }, [runSecurityScan]);

  return {
    showSecurityDialog,
    setShowSecurityDialog,
    securityResult,
    isSecurityScanning,
    noCachedSecurityResult,
    scanError,
    runSecurityScan,
    openSecurityDialog,
  };
}
