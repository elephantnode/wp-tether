"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Package, Download, Upload, Database, Globe, Trash2 } from "lucide-react";

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

  useEffect(() => {
    fetchPresets();
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      {/* データエクスポート/インポート */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            データ管理
          </CardTitle>
          <CardDescription>
            サイト一覧やデプロイターゲットの設定をJSON形式でエクスポート/インポートできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
      </Card>

      {/* プラグインプリセット */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            プラグインプリセット
          </CardTitle>
          <CardDescription>
            新規サイトにインストールするプラグインのスラッグを1行ずつ入力してください。
            サイト一覧から「プラグインインストール」ボタンで一括インストール + 有効化できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      </Card>
    </div>
  );
}
