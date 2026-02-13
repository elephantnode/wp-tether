"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Package } from "lucide-react";

export default function SettingsPage() {
  const [plugins, setPlugins] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
