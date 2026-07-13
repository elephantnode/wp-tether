"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Package, Download, Upload, Database, Globe, Trash2, ChevronDown, FolderOpen, Terminal, Code2, Plus, Check, Bell, Send } from "lucide-react";
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
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const [plugins, setPlugins] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // エクスポート/インポート用state
  const [isExporting, setIsExporting] = useState<"sites" | "deploy-targets" | null>(null);
  const [isImporting, setIsImporting] = useState<"sites" | "deploy-targets" | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const sitesFileInputRef = useRef<HTMLInputElement>(null);
  const targetsFileInputRef = useRef<HTMLInputElement>(null);

  // クリーンアップ用state
  const [isCleaning, setIsCleaning] = useState(false);

  // アプリ設定（データディレクトリ）
  const [dataDir, setDataDir] = useState("");
  const [resolvedDataDir, setResolvedDataDir] = useState("");
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [pathMessage, setPathMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showMigrateDialog, setShowMigrateDialog] = useState(false);

  // バックアップ保存先
  const [backupDir, setBackupDir] = useState("");
  const [resolvedBackupDir, setResolvedBackupDir] = useState("");
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const [isPickingBackupFolder, setIsPickingBackupFolder] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 通知設定
  const [notifyMac, setNotifyMac] = useState(true);
  const [notifySlack, setNotifySlack] = useState("");
  const [notifyGChat, setNotifyGChat] = useState("");
  const [notifyMinLevel, setNotifyMinLevel] = useState<"info" | "warning" | "critical">("warning");
  const [isSavingNotify, setIsSavingNotify] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  // 外部アプリ設定
  const [terminalApp, setTerminalApp] = useState("Terminal");
  const [terminalApps, setTerminalApps] = useState<string[]>(["Terminal"]);
  const [isPickingTerminal, setIsPickingTerminal] = useState(false);
  const [editorApp, setEditorApp] = useState("Visual Studio Code");
  const [editorApps, setEditorApps] = useState<string[]>(["Visual Studio Code"]);
  const [isPickingEditor, setIsPickingEditor] = useState(false);
  const [isSavingApps, setIsSavingApps] = useState(false);
  const [appsMessage, setAppsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 展開状態
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    appConfig: false,
    backupConfig: false,
    notifyConfig: false,
    externalApps: false,
    data: false,
    plugins: false,
  });

  useEffect(() => {
    fetchPresets();
    fetchAppConfig();
  }, []);

  async function fetchAppConfig() {
    try {
      const res = await fetch("/api/app-config");
      if (res.ok) {
        const data = await res.json();
        setDataDir(data.dataDir ?? "");
        setResolvedDataDir(data.resolvedDataDir ?? "");
        setBackupDir(data.backupDir ?? "");
        setResolvedBackupDir(data.resolvedBackupDir ?? "");

        const n = data.notify ?? {};
        setNotifyMac(n.macNotifications !== false);
        setNotifySlack(n.slackWebhookUrl ?? "");
        setNotifyGChat(n.googleChatWebhookUrl ?? "");
        setNotifyMinLevel(n.minLevel ?? "warning");

        const savedTerminal = data.terminalApp ?? "Terminal";
        const savedTerminalApps: string[] = Array.isArray(data.terminalApps) && data.terminalApps.length
          ? data.terminalApps
          : [savedTerminal];
        setTerminalApp(savedTerminal);
        setTerminalApps(savedTerminalApps);

        const savedEditor = data.editorApp ?? "Visual Studio Code";
        const savedEditorApps: string[] = Array.isArray(data.editorApps) && data.editorApps.length
          ? data.editorApps
          : [savedEditor];
        setEditorApp(savedEditor);
        setEditorApps(savedEditorApps);
      }
    } catch (error) {
      console.error("Failed to fetch app config:", error);
    }
  }

  async function pickAndAddApp(
    apps: string[],
    setApps: (v: string[]) => void,
    activeApp: string,
    setActive: (v: string) => void,
    setIsPicking: (v: boolean) => void,
  ) {
    setIsPicking(true);
    try {
      const res = await fetch("/api/pick-app");
      if (!res.ok) return;
      const data = await res.json();
      if (data.cancelled || !data.appName) return;
      const name: string = data.appName;
      if (apps.includes(name)) return;
      const next = [...apps, name];
      setApps(next);
      if (!activeApp) setActive(name);
    } catch {
      // キャンセル等は無視
    } finally {
      setIsPicking(false);
    }
  }

  function removeTerminalApp(name: string) {
    const next = terminalApps.filter((a) => a !== name);
    setTerminalApps(next);
    if (terminalApp === name) setTerminalApp(next[0] ?? "");
  }

  function removeEditorApp(name: string) {
    const next = editorApps.filter((a) => a !== name);
    setEditorApps(next);
    if (editorApp === name) setEditorApp(next[0] ?? "");
  }

  async function handleSaveApps() {
    setIsSavingApps(true);
    setAppsMessage(null);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalApp, terminalApps, editorApp, editorApps }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存に失敗しました");
      }
      setAppsMessage({ type: "success", text: "保存しました" });
    } catch (error) {
      setAppsMessage({ type: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setIsSavingApps(false);
    }
  }

  async function handlePickFolder() {
    setIsPickingFolder(true);
    try {
      const res = await fetch("/api/pick-folder");
      if (res.ok) {
        const data = await res.json();
        if (!data.cancelled && data.path) {
          setDataDir(data.path);
        }
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    } finally {
      setIsPickingFolder(false);
    }
  }

  function handleSavePath() {
    const isChangingToNewPath = dataDir !== resolvedDataDir;
    if (dataDir && isChangingToNewPath) {
      setShowMigrateDialog(true);
    } else {
      savePath(false);
    }
  }

  async function savePath(migrate: boolean) {
    setIsSavingPath(true);
    setPathMessage(null);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataDir, migrate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setDataDir(data.dataDir ?? "");
      setResolvedDataDir(data.resolvedDataDir ?? "");
      setPathMessage({
        type: "success",
        text: migrate ? "保存しました（既存データをコピーしました）" : "保存しました",
      });
    } catch (error) {
      setPathMessage({ type: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setIsSavingPath(false);
    }
  }

  async function handlePickBackupFolder() {
    setIsPickingBackupFolder(true);
    try {
      const res = await fetch("/api/pick-folder");
      if (res.ok) {
        const data = await res.json();
        if (!data.cancelled && data.path) {
          setBackupDir(data.path);
        }
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    } finally {
      setIsPickingBackupFolder(false);
    }
  }

  async function saveBackupDir() {
    setIsSavingBackup(true);
    setBackupMessage(null);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupDir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setBackupDir(data.backupDir ?? "");
      setResolvedBackupDir(data.resolvedBackupDir ?? "");
      setBackupMessage({ type: "success", text: "保存しました" });
    } catch (error) {
      setBackupMessage({ type: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setIsSavingBackup(false);
    }
  }

  async function saveNotifyConfig() {
    setIsSavingNotify(true);
    setNotifyMessage(null);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notify: {
            macNotifications: notifyMac,
            slackWebhookUrl: notifySlack,
            googleChatWebhookUrl: notifyGChat,
            minLevel: notifyMinLevel,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setNotifyMessage({ type: "success", text: "保存しました" });
    } catch (error) {
      setNotifyMessage({ type: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setIsSavingNotify(false);
    }
  }

  async function handleTestNotify(channel: "slack" | "google_chat" | "mac", webhookUrl?: string) {
    setTestingChannel(channel);
    setNotifyMessage(null);
    try {
      const res = await fetch("/api/notify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, webhookUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifyMessage({ type: "success", text: "テスト通知を送信しました" });
      } else {
        setNotifyMessage({ type: "error", text: data.error || "送信に失敗しました" });
      }
    } catch (error) {
      setNotifyMessage({ type: "error", text: error instanceof Error ? error.message : "送信失敗" });
    } finally {
      setTestingChannel(null);
    }
  }

  async function fetchPresets() {
    try {
      const res = await fetch("/api/plugin-presets");
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins.join("\n"));
      }
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);

    try {
      const pluginList = plugins
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const res = await fetch("/api/plugin-presets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plugins: pluginList }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins.join("\n"));
        setMessage({ type: "success", text: "保存しました" });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport(type: "sites" | "deploy-targets") {
    setIsExporting(type);
    setImportMessage(null);

    try {
      const res = await fetch(`/api/export/${type}`);
      if (!res.ok) throw new Error("エクスポートに失敗しました");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wp-tether-${type}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setImportMessage({ type: "success", text: "エクスポートしました" });
    } catch {
      setImportMessage({ type: "error", text: "エクスポートに失敗しました" });
    } finally {
      setIsExporting(null);
    }
  }

  async function handleImport(type: "sites" | "deploy-targets", file: File) {
    setIsImporting(type);
    setImportMessage(null);

    try {
      const content = await file.text();
      const importData = JSON.parse(content);

      const res = await fetch(`/api/import/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...importData, mode: importMode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "インポートに失敗しました");
      }

      setImportMessage({ type: "success", text: data.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "インポートに失敗しました";
      setImportMessage({ type: "error", text: message });
    } finally {
      setIsImporting(null);
      if (type === "sites" && sitesFileInputRef.current) {
        sitesFileInputRef.current.value = "";
      }
      if (type === "deploy-targets" && targetsFileInputRef.current) {
        targetsFileInputRef.current.value = "";
      }
    }
  }

  async function handleCleanup() {
    setIsCleaning(true);
    setImportMessage(null);

    try {
      const res = await fetch("/api/cleanup/orphan-targets", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "クリーンアップに失敗しました");
      }

      setImportMessage({ type: "success", text: data.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "クリーンアップに失敗しました";
      setImportMessage({ type: "error", text: message });
    } finally {
      setIsCleaning(false);
    }
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <>
    <AlertDialog open={showMigrateDialog} onOpenChange={setShowMigrateDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>既存データをコピーしますか？</AlertDialogTitle>
          <AlertDialogDescription>
            現在の sites.json・deploy-targets.json・plugin-presets.json を新しいフォルダにコピーします。
            新しいフォルダにすでにファイルが存在する場合はコピーしません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => savePath(false)}>コピーしない</AlertDialogCancel>
          <AlertDialogAction onClick={() => savePath(true)}>コピーする</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="space-y-4">
      <h1 className="text-2xl font-bold">設定</h1>

      {/* データフォルダ設定 */}
      <Collapsible open={openSections.appConfig} onOpenChange={() => toggleSection("appConfig")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">データフォルダ設定</CardTitle>
                    <CardDescription className="mt-1">
                      sites.json・deploy-targets.json・plugin-presets.json の保存場所を変更
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openSections.appConfig ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">データフォルダ</label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="空欄 = デフォルト (data/)"
                    value={dataDir}
                    onChange={(e) => setDataDir(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePickFolder}
                    disabled={isPickingFolder}
                    title="フォルダを選択"
                  >
                    {isPickingFolder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                  </Button>
                  <Button onClick={handleSavePath} disabled={isSavingPath} size="sm">
                    {isSavingPath ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    保存
                  </Button>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>有効フォルダ: <code className="bg-muted px-1 rounded">{resolvedDataDir || "（取得中）"}</code></p>
                  <p className="text-muted-foreground/70">
                    sites.json / deploy-targets.json / plugin-presets.json がこのフォルダに保存されます
                  </p>
                </div>
              </div>

              {pathMessage && (
                <div
                  className={`p-3 rounded-md text-sm ${
                    pathMessage.type === "success"
                      ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                      : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
                  }`}
                >
                  {pathMessage.text}
                </div>
              )}

              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">使い方:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>空欄にするとデフォルト（<code className="bg-muted px-1 rounded">data/</code>）を使用</li>
                  <li>フォルダアイコンでネイティブダイアログから選択可能</li>
                  <li>絶対パスまたは <code className="bg-muted px-1 rounded">~/...</code> 形式で直接入力も可</li>
                  <li>例: <code className="bg-muted px-1 rounded">~/Dropbox/wp-tether</code></li>
                </ul>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* バックアップ保存先設定 */}
      <Collapsible open={openSections.backupConfig} onOpenChange={() => toggleSection("backupConfig")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">バックアップ保存先</CardTitle>
                    <CardDescription className="mt-1">
                      サーバーから取得したファイル・DB の保存場所を指定
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openSections.backupConfig ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">バックアップフォルダ</label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="空欄 = デフォルト ({データフォルダ}/backups/servers)"
                    value={backupDir}
                    onChange={(e) => setBackupDir(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePickBackupFolder}
                    disabled={isPickingBackupFolder}
                    title="フォルダを選択"
                  >
                    {isPickingBackupFolder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                  </Button>
                  <Button onClick={saveBackupDir} disabled={isSavingBackup} size="sm">
                    {isSavingBackup ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    保存
                  </Button>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>有効フォルダ: <code className="bg-muted px-1 rounded">{resolvedBackupDir || "（取得中）"}</code></p>
                  <p className="text-muted-foreground/70">
                    各サーバーのバックアップは <code className="bg-muted px-1 rounded">このフォルダ/サーバー名_ID/タイムスタンプ/</code> に保存されます
                  </p>
                </div>
              </div>

              {backupMessage && (
                <div
                  className={`p-3 rounded-md text-sm ${
                    backupMessage.type === "success"
                      ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                      : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
                  }`}
                >
                  {backupMessage.text}
                </div>
              )}

              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">使い方:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>空欄にするとデフォルト（<code className="bg-muted px-1 rounded">データフォルダ/backups/servers</code>）を使用</li>
                  <li>フォルダアイコンでネイティブダイアログから選択可能</li>
                  <li>例: <code className="bg-muted px-1 rounded">~/Dropbox/wp-backups</code> や外付けドライブのパス</li>
                </ul>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 通知設定 */}
      <Collapsible open={openSections.notifyConfig} onOpenChange={() => toggleSection("notifyConfig")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">通知設定</CardTitle>
                    <CardDescription className="mt-1">
                      Slack・Google Chat・macOS への通知チャネルを設定
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${openSections.notifyConfig ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-0">

              {/* 最低通知レベル */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">外部送信の最低レベル</label>
                <Select value={notifyMinLevel} onValueChange={(v) => setNotifyMinLevel(v as typeof notifyMinLevel)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">INFO 以上（全て送信）</SelectItem>
                    <SelectItem value="warning">WARNING 以上（推奨）</SelectItem>
                    <SelectItem value="critical">CRITICAL のみ</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">アプリ内通知は常に全レベル記録されます</p>
              </div>

              {/* macOS */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Checkbox checked={notifyMac} onCheckedChange={(c) => setNotifyMac(!!c)} />
                  macOS ネイティブ通知
                </label>
                {notifyMac && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testingChannel === "mac"}
                    onClick={() => handleTestNotify("mac")}
                  >
                    {testingChannel === "mac" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                    テスト送信
                  </Button>
                )}
              </div>

              {/* Slack */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Slack Incoming Webhook URL</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://hooks.slack.com/services/..."
                    value={notifySlack}
                    onChange={(e) => setNotifySlack(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!notifySlack || testingChannel === "slack"}
                    onClick={() => handleTestNotify("slack", notifySlack)}
                  >
                    {testingChannel === "slack" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Slack アプリ管理 → Incoming Webhooks で取得</p>
              </div>

              {/* Google Chat */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Google Chat Webhook URL</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://chat.googleapis.com/v1/spaces/..."
                    value={notifyGChat}
                    onChange={(e) => setNotifyGChat(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!notifyGChat || testingChannel === "google_chat"}
                    onClick={() => handleTestNotify("google_chat", notifyGChat)}
                  >
                    {testingChannel === "google_chat" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">スペース設定 → アプリと統合 → Webhook で取得</p>
              </div>

              {/* メッセージ */}
              {notifyMessage && (
                <div className={`p-3 rounded-md text-sm ${notifyMessage.type === "success" ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200" : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"}`}>
                  {notifyMessage.text}
                </div>
              )}

              <Button onClick={saveNotifyConfig} disabled={isSavingNotify} size="sm">
                {isSavingNotify ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                保存
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 外部アプリ設定 */}
      <Collapsible open={openSections.externalApps} onOpenChange={() => toggleSection("externalApps")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">外部アプリ設定</CardTitle>
                    <CardDescription className="mt-1">
                      サイトカードから開くターミナル・エディタを指定
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openSections.externalApps ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* ターミナル */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  ターミナル
                </label>
                <div className="space-y-1">
                  {terminalApps.map((app) => (
                    <div
                      key={app}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                        terminalApp === app
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setTerminalApp(app)}
                    >
                      <div className={`w-4 h-4 flex items-center justify-center shrink-0 ${terminalApp === app ? "text-primary" : "text-transparent"}`}>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="flex-1 text-sm font-mono">{app}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTerminalApp(app); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pickAndAddApp(terminalApps, setTerminalApps, terminalApp, setTerminalApp, setIsPickingTerminal)}
                  disabled={isPickingTerminal}
                >
                  {isPickingTerminal ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  アプリを選択して追加
                </Button>
              </div>

              {/* エディタ */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Code2 className="w-4 h-4" />
                  エディタ
                </label>
                <div className="space-y-1">
                  {editorApps.map((app) => (
                    <div
                      key={app}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                        editorApp === app
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setEditorApp(app)}
                    >
                      <div className={`w-4 h-4 flex items-center justify-center shrink-0 ${editorApp === app ? "text-primary" : "text-transparent"}`}>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="flex-1 text-sm font-mono">{app}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeEditorApp(app); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pickAndAddApp(editorApps, setEditorApps, editorApp, setEditorApp, setIsPickingEditor)}
                  disabled={isPickingEditor}
                >
                  {isPickingEditor ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  アプリを選択して追加
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveApps} disabled={isSavingApps} size="sm">
                  {isSavingApps ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存
                </Button>
                {appsMessage && (
                  <span
                    className={`text-sm ${
                      appsMessage.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {appsMessage.text}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                macOS の <code className="bg-muted px-1 rounded">open -a [アプリ名]</code> コマンドで起動します。アプリ名はアプリケーションフォルダに表示される名前を入力してください。
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* データエクスポート/インポート */}
      <Collapsible open={openSections.data} onOpenChange={() => toggleSection("data")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">データ管理</CardTitle>
                    <CardDescription className="mt-1">
                      サイト一覧やデプロイターゲットの設定をエクスポート/インポート
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openSections.data ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* インポートモード選択 */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">インポートモード:</span>
                <Select value={importMode} onValueChange={(v) => setImportMode(v as "merge" | "replace")}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">マージ（追加・更新）</SelectItem>
                    <SelectItem value="replace">上書き（置き換え）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* サイト一覧 */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  <span className="font-medium">サイト一覧</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("sites")}
                    disabled={isExporting === "sites"}
                  >
                    {isExporting === "sites" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    エクスポート
                  </Button>
                  <input
                    ref={sitesFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport("sites", file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sitesFileInputRef.current?.click()}
                    disabled={isImporting === "sites"}
                  >
                    {isImporting === "sites" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    インポート
                  </Button>
                </div>
              </div>

              {/* デプロイターゲット */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span className="font-medium">デプロイターゲット</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("deploy-targets")}
                    disabled={isExporting === "deploy-targets"}
                  >
                    {isExporting === "deploy-targets" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    エクスポート
                  </Button>
                  <input
                    ref={targetsFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport("deploy-targets", file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => targetsFileInputRef.current?.click()}
                    disabled={isImporting === "deploy-targets"}
                  >
                    {isImporting === "deploy-targets" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    インポート
                  </Button>
                </div>
              </div>

              {/* 孤児データクリーンアップ */}
              <div className="border rounded-lg p-4 space-y-3 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-600" />
                  <span className="font-medium">孤児データのクリーンアップ</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  削除されたサイトに紐づくデプロイターゲットを自動的に削除します。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanup}
                  disabled={isCleaning}
                >
                  {isCleaning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  クリーンアップ実行
                </Button>
              </div>

              {importMessage && (
                <div
                  className={`p-3 rounded-md text-sm ${
                    importMessage.type === "success"
                      ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                      : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
                  }`}
                >
                  {importMessage.text}
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">注意:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>マージ</strong>: 同じIDのデータは更新、新しいIDは追加</li>
                  <li><strong>上書き</strong>: 既存データを完全に置き換え</li>
                  <li>デプロイターゲットにはSSH秘密鍵のパスやDB認証情報が含まれます</li>
                </ul>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* プラグインプリセット */}
      <Collapsible open={openSections.plugins} onOpenChange={() => toggleSection("plugins")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">プラグインプリセット</CardTitle>
                    <CardDescription className="mt-1">
                      新規サイトにインストールするプラグイン一覧
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openSections.plugins ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <Textarea
                placeholder="advanced-custom-fields
contact-form-7
wp-mail-smtp"
                value={plugins}
                onChange={(e) => setPlugins(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />

              <div className="flex items-center gap-4">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存
                </Button>

                {message && (
                  <span
                    className={
                      message.type === "success"
                        ? "text-green-600 text-sm"
                        : "text-destructive text-sm"
                    }
                  >
                    {message.text}
                  </span>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">プラグインスラッグの確認方法:</p>
                <p>
                  WordPress公式リポジトリのURLから確認できます。
                  <br />
                  例: <code className="bg-muted px-1 rounded">https://wordpress.org/plugins/<strong>contact-form-7</strong>/</code>
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
    </>
  );
}
