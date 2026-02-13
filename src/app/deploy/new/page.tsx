"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  siteId: z.string().min(1, "サイトを選択してください"),
  name: z
    .string()
    .min(1, "ターゲット名を入力してください")
    .regex(/^[a-z0-9-]+$/, "小文字英数字とハイフンのみ使用できます"),
  type: z.enum(["ssh", "sftp", "ftp"]),
  vhost: z.string().url("有効なURLを入力してください"),
  wordpressPath: z.string().min(1, "WordPressパスを入力してください"),
  // SSH設定
  sshHost: z.string().optional(),
  sshUser: z.string().optional(),
  sshPort: z.number().min(1).max(65535).optional(),
  sshKeyPath: z.string().optional(),
  // データベース設定
  dbHost: z.string().min(1, "DBホストを入力してください"),
  dbName: z.string().min(1, "DB名を入力してください"),
  dbUser: z.string().min(1, "DBユーザーを入力してください"),
  dbPassword: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  siteId: "",
  name: "",
  type: "ssh",
  vhost: "https://",
  wordpressPath: "/var/www/html",
  sshHost: "",
  sshUser: "",
  sshPort: 22,
  sshKeyPath: "~/.ssh/id_rsa",
  dbHost: "localhost",
  dbName: "",
  dbUser: "",
  dbPassword: "",
};

interface Site {
  id: string;
  name: string;
}

export default function NewDeployTargetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSiteId = searchParams.get("siteId");

  const [sites, setSites] = useState<Site[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...defaultValues,
      siteId: preselectedSiteId || "",
    },
  });

  const watchType = form.watch("type");

  // サイト一覧を取得
  useEffect(() => {
    async function fetchSites() {
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        setSites(data.sites || []);
      } catch (error) {
        console.error("Failed to fetch sites:", error);
      } finally {
        setIsLoadingSites(false);
      }
    }
    fetchSites();
  }, []);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        siteId: data.siteId,
        name: data.name,
        type: data.type,
        vhost: data.vhost,
        wordpressPath: data.wordpressPath,
        ssh: data.type === "ssh" ? {
          host: data.sshHost,
          user: data.sshUser,
          port: data.sshPort || 22,
          keyPath: data.sshKeyPath || undefined,
        } : undefined,
        database: {
          host: data.dbHost,
          name: data.dbName,
          user: data.dbUser,
          password: data.dbPassword || "",
        },
        exclude: [],
      };

      const res = await fetch("/api/deploy-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "作成に失敗しました");
      }

      router.push("/deploy");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">デプロイターゲット追加</h1>
        <p className="text-muted-foreground">
          リモートサーバーへの接続設定を追加します
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 基本設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                基本設定
                {isLoadingSites && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>対象サイト</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="サイトを選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ターゲット名</FormLabel>
                    <FormControl>
                      <Input placeholder="production" {...field} />
                    </FormControl>
                    <FormDescription>
                      例: production, staging, development
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>接続方式</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ssh">SSH</SelectItem>
                        <SelectItem value="sftp" disabled>SFTP（準備中）</SelectItem>
                        <SelectItem value="ftp" disabled>FTP（準備中）</SelectItem>
                      </SelectContent>
                    </Select>
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
                      リモートサイトの公開URL
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
                      リモートサーバー上のWordPressインストールパス
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* SSH設定 */}
          {watchType === "ssh" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">SSH接続設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sshHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ホスト</FormLabel>
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
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
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
                      <FormLabel>ユーザー名</FormLabel>
                      <FormControl>
                        <Input placeholder="username" {...field} />
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
                      <FormLabel>SSHキーパス</FormLabel>
                      <FormControl>
                        <Input placeholder="~/.ssh/id_rsa" {...field} />
                      </FormControl>
                      <FormDescription>
                        ローカルマシン上のSSH秘密鍵パス
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* データベース設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">データベース設定（将来用）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dbHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DBホスト</FormLabel>
                      <FormControl>
                        <Input placeholder="localhost" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dbName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DB名</FormLabel>
                      <FormControl>
                        <Input placeholder="wordpress" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dbUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DBユーザー</FormLabel>
                      <FormControl>
                        <Input placeholder="wp_user" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dbPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DBパスワード</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* エラー表示 */}
          {submitError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {submitError}
            </div>
          )}

          {/* アクション */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isSubmitting || isLoadingSites}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              作成
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/deploy")}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
