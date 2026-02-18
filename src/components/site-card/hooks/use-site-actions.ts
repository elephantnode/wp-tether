import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UseSiteActionsOptions {
  siteId: string;
  sitePath: string;
}

export function useSiteActions({ siteId, sitePath }: UseSiteActionsOptions) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInstallingPlugins, setIsInstallingPlugins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pluginResult, setPluginResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/start`, { method: "POST" });
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
  }, [siteId, router]);

  const handleStop = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/stop`, { method: "POST" });
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
  }, [siteId, router]);

  const handleDelete = useCallback(
    async (deleteFiles: boolean, deleteVolumes: boolean) => {
      setIsDeleting(true);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${siteId}`, {
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
    },
    [siteId, router]
  );

  const handleInstallPlugins = useCallback(async () => {
    setIsInstallingPlugins(true);
    setPluginResult(null);
    setError(null);
    try {
      const res = await fetch("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
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
  }, [siteId]);

  const openFolder = useCallback(async () => {
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sitePath }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "フォルダを開けませんでした");
      }
    } catch {
      setError("フォルダを開けませんでした");
    }
  }, [sitePath]);

  const openTerminal = useCallback(async () => {
    try {
      const res = await fetch("/api/open-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sitePath }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "ターミナルを開けませんでした");
      }
    } catch {
      setError("ターミナルを開けませんでした");
    }
  }, [sitePath]);

  return {
    isLoading,
    isDeleting,
    isInstallingPlugins,
    error,
    setError,
    pluginResult,
    handleStart,
    handleStop,
    handleDelete,
    handleInstallPlugins,
    openFolder,
    openTerminal,
  };
}
