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
import { Loader2, Save, Package, Download, Upload, Database, Globe, Trash2, ChevronDown, FolderOpen } from "lucide-react";

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

  // アプリ設定（データパス）
  const [sitesJsonPath, setSitesJsonPath] = useState("");
  const [resolvedPath, setResolvedPath] = useState("");
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [pathMessage, setPathMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 展開状態
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    appConfig: false,
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
        setSitesJsonPath(data.sitesJsonPath ?? "");
        setResolvedPath(data.resolvedSitesJsonPath ?? "");
      }
    } catch (error) {
      console.error("Failed to fetch app config:", error);
    }
  }

  async function handleSavePath() {
    setIsSavingPath(true);
    setPathMessage(null);
    try {
      const res = await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitesJsonPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setSitesJsonPath(data.sitesJsonPath ?? "");
      // GET で解決済みパスを再取得
      const getRes = await fetch("/api/app-config");
      if (getRes.ok) {
        const getData = await getRes.json();
        setResolvedPath(getData.resolvedSitesJsonPath ?? "");
      }
      setPathMessage({ type: "success", text: "保存しました" });
    } catch (error) {
      setPathMessage({ type: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setIsSavingPath(false);
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
      // ファイル入力をリセット
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">設定</h1>

      {/* データパス設定 */}
      <Collapsible open={openSections.appConfig} onOpenChange={() => toggleSection("appConfig")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  <div>
                    <CardTitle className="text-base">データパス設定</CardTitle>
                    <CardDescription className="mt-1">
                      sites.json の保存場所を変更して複数のwp-tetherインスタンス間で設定を共有
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
                <label className="text-sm font-medium">sites.json のパス</label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="空欄 = デフォルト (data/sites.json)"
                    value={sitesJsonPath}
                    onChange={(e) => setSitesJsonPath(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button onClick={handleSavePath} disabled={isSavingPath} size="sm">
                    {isSavingPath ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    保存
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  現在の有効パス:{" "}
                  <code className="bg-muted px-1 rounded">{resolvedPath || "（取得中）"}</code>
                </p>
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
                  <li>空欄にするとデフォルト（<code className="bg-muted px-1 rounded">data/sites.json</code>）を使用</li>
                  <li>絶対パスまたは <code className="bg-muted px-1 rounded">~/...</code> 形式で指定</li>
                  <li>例: <code className="bg-muted px-1 rounded">~/Dropbox/wp-tether/sites.json</code></li>
                  <li>指定先のファイルが存在しない場合は自動作成されます</li>
                </ul>
              </div>
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
  );
}
