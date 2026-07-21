"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { DeployTarget } from "@/types";
import {
  MonitoringFields,
  monitoringFormSchema,
  monitoringDefaultValues,
  monitoringToFormValues,
  buildMonitoringConfig,
} from "@/components/monitoring-fields";

export const serverFormSchema = z.object({
  name: z
    .string()
    .min(1, "サーバー名を入力してください")
    .regex(/^[a-z0-9-]+$/, "小文字英数字とハイフンのみ使用できます"),
  vhost: z.string().url("有効なURLを入力してください"),
  wordpressPath: z.string().min(1, "WordPressパスを入力してください"),
  sshHost: z.string().min(1, "SSHホストを入力してください"),
  sshUser: z.string().min(1, "SSHユーザーを入力してください"),
  sshPort: z.number().min(1).max(65535),
  sshKeyPath: z.string().optional(),
  wpCliPath: z.string().optional(),
  basicAuthUser: z.string().optional(),
  basicAuthPassword: z.string().optional(),
  tags: z.string().optional(),
  ...monitoringFormSchema,
});

export type ServerFormValues = z.infer<typeof serverFormSchema>;

const defaultValues: ServerFormValues = {
  name: "",
  vhost: "https://",
  wordpressPath: "/var/www/html",
  sshHost: "",
  sshUser: "",
  sshPort: 22,
  sshKeyPath: "~/.ssh/id_rsa",
  wpCliPath: "",
  basicAuthUser: "",
  basicAuthPassword: "",
  tags: "",
  ...monitoringDefaultValues,
};

/** 既存ターゲットをフォーム初期値に変換 */
export function targetToServerFormValues(t: DeployTarget): ServerFormValues {
  return {
    name: t.name,
    vhost: t.vhost,
    wordpressPath: t.wordpressPath,
    sshHost: t.ssh?.host ?? "",
    sshUser: t.ssh?.user ?? "",
    sshPort: t.ssh?.port ?? 22,
    sshKeyPath: t.ssh?.keyPath ?? "",
    wpCliPath: t.wpCli?.path ?? "",
    basicAuthUser: t.basicAuth?.user ?? "",
    basicAuthPassword: t.basicAuth?.password ?? "",
    tags: t.tags?.join(", ") ?? "",
    ...monitoringToFormValues(t.monitoring),
  };
}

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ServerFormProps {
  mode: "create" | "edit";
  /** 編集時の対象ID */
  targetId?: string;
  initialValues?: ServerFormValues;
}

export function ServerForm({ mode, targetId, initialValues }: ServerFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: initialValues ?? defaultValues,
  });

  async function onSubmit(data: ServerFormValues) {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const ssh = {
        host: data.sshHost,
        user: data.sshUser,
        port: data.sshPort || 22,
        keyPath: data.sshKeyPath || undefined,
      };
      const basicAuth = data.basicAuthUser
        ? { user: data.basicAuthUser, password: data.basicAuthPassword || "" }
        : undefined;
      const tags = parseTags(data.tags);
      const monitoring = buildMonitoringConfig(data);

      const [url, method, payload] =
        mode === "create"
          ? [
              "/api/servers",
              "POST",
              {
                name: data.name,
                vhost: data.vhost,
                wordpressPath: data.wordpressPath,
                ssh,
                wpCliPath: data.wpCliPath || undefined,
                basicAuth,
                tags,
                monitoring,
              },
            ]
          : [
              `/api/deploy-targets/${targetId}`,
              "PUT",
              {
                name: data.name,
                type: "ssh" as const,
                vhost: data.vhost,
                wordpressPath: data.wordpressPath,
                ssh,
                // 未入力に戻された場合に消えるよう null を送る
                basicAuth: basicAuth ?? null,
                tags,
                monitoring,
                wpCli: data.wpCliPath
                  ? { available: true, path: data.wpCliPath }
                  : undefined,
              },
            ];

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || (mode === "create" ? "登録に失敗しました" : "更新に失敗しました"));
      }

      router.push("/servers");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本情報</CardTitle>
            <CardDescription>
              監視・保守の対象となるリモートサーバーの情報を入力します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>サーバー名</FormLabel>
                  <FormControl>
                    <Input placeholder="client-a-production" {...field} />
                  </FormControl>
                  <FormDescription>
                    識別用の名前。リモートのバックアップ保存先名にも使われます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vhost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>サイトURL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    HTTP稼働チェックとSSL証明書の期限監視に使用します
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="wordpressPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WordPressパス</FormLabel>
                  <FormControl>
                    <Input placeholder="/var/www/html" {...field} />
                  </FormControl>
                  <FormDescription>
                    リモートサーバー上の WordPress ルートディレクトリの絶対パス
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>タグ（任意）</FormLabel>
                  <FormControl>
                    <Input placeholder="production, client-a" {...field} />
                  </FormControl>
                  <FormDescription>カンマ区切り。グルーピング用のラベルです</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* SSH接続 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SSH接続</CardTitle>
            <CardDescription>
              監視・セキュリティチェック・メンテナンスは全てSSH経由で実行されます
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sshHost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SSHホスト</FormLabel>
                    <FormControl>
                      <Input placeholder="example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sshPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ポート</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        {...field}
                        value={field.value ?? 22}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 22)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sshUser"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SSHユーザー</FormLabel>
                  <FormControl>
                    <Input placeholder="deploy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sshKeyPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>秘密鍵のパス（任意）</FormLabel>
                  <FormControl>
                    <Input placeholder="~/.ssh/id_rsa" {...field} />
                  </FormControl>
                  <FormDescription>
                    空欄の場合は ssh の既定の鍵が使われます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* WP-CLI / Basic認証 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">WP-CLI・Basic認証</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="wpCliPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WP-CLIのパス（任意）</FormLabel>
                  <FormControl>
                    <Input placeholder="/usr/local/bin/wp" {...field} />
                  </FormControl>
                  <FormDescription>
                    空欄でOK。接続テスト時に自動検出されます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="basicAuthUser"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Basic認証ユーザー（任意）</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="basicAuthPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Basic認証パスワード</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              サイトにBASIC認証がかかっている場合のみ、HTTP稼働チェック用に設定してください
            </p>
          </CardContent>
        </Card>

        {/* 監視設定 */}
        <MonitoringFields />

        {submitError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "create" ? "サーバーを登録" : "更新"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/servers")}>
            キャンセル
          </Button>
        </div>
      </form>
    </Form>
  );
}
