import { useState, useCallback } from "react";

interface UseTunnelOptions {
  siteId: string;
}

export function useTunnel({ siteId }: UseTunnelOptions) {
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelProvider, setTunnelProvider] = useState<string | null>(null);
  const [isTunneling, setIsTunneling] = useState(false);
  const [showTunnelDialog, setShowTunnelDialog] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const handleStartTunnel = useCallback(async () => {
    setIsTunneling(true);
    setTunnelError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/tunnel`, { method: "POST" });
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
  }, [siteId]);

  const handleStopTunnel = useCallback(async () => {
    try {
      await fetch(`/api/sites/${siteId}/tunnel`, { method: "DELETE" });
      setTunnelUrl(null);
      setTunnelProvider(null);
      setShowTunnelDialog(false);
    } catch {
      // エラーは無視
    }
  }, [siteId]);

  const copyTunnelUrl = useCallback(async () => {
    if (!tunnelUrl) return;
    try {
      await navigator.clipboard.writeText(tunnelUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = tunnelUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, [tunnelUrl]);

  return {
    tunnelUrl,
    tunnelProvider,
    isTunneling,
    showTunnelDialog,
    setShowTunnelDialog,
    tunnelError,
    handleStartTunnel,
    handleStopTunnel,
    copyTunnelUrl,
  };
}
