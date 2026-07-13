"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { DeployTarget, DEFAULT_MONITORING_THRESHOLDS } from "@/types";

const formSchema = z.object({
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
  // Basic認証（任意）
  basicAuthUser: z.string().optional(),
  basicAuthPassword: z.string().optional(),
  // 監視設定
  monitoringEnabled: z.boolean().optional(),
  monitoringIntervalMinutes: z.number().min(1).max(1440).optional(),
  monitoringDiskPercent: z.number().min(1).max(99).optional(),
  monitoringSslDays: z.number().min(1).max(365).optional(),
  monitoringHttpMs: z.number().min(100).max(60000).optional(),
  // データベース設定
  dbHost: z.string().min(1, "DBホストを入力してください"),
  dbName: z.string().min(1, "DB名を入力してください"),
  dbUser: z.string().min(1, "DBユーザーを入力してください"),
  dbPassword: z.string().optional(),
  // 除外パターン
  exclude: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditDeployTargetPage() {
  const router = useRouter();
  const params = useParams();
  const targetId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [target, setTarget] = useState<DeployTarget | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "ssh",
      vhost: "",
      wordpressPath: "",
      sshHost: "",
      sshUser: "",
      sshPort: 22,
      sshKeyPath: "",
      basicAuthUser: "",
      basicAuthPassword: "",
      monitoringEnabled: false,
      monitoringIntervalMinutes: 30,
      monitoringDiskPercent: DEFAULT_MONITORING_THRESHOLDS.diskUsagePercent,
      monitoringSslDays: DEFAULT_MONITORING_THRESHOLDS.sslExpiryDays,
      monitoringHttpMs: DEFAULT_MONITORING_THRESHOLDS.httpResponseMs,
      dbHost: "localhost",
      dbName: "",
      dbUser: "",
      dbPassword: "",
      exclude: "",
    },
  });

  const watchType = form.watch("type");
  const watchMonitoringEnabled = form.watch("monitoringEnabled");

  // ターゲット情報を取得
  useEffect(() => {
    async function fetchTarget() {
      try {
        const res = await fetch(`/api/deploy-targets/${targetId}`);
        if (!res.ok) {
          throw new Error("ターゲットが見つかりません");
        }
        const data = await res.json();
        const t: DeployTarget = data.target;
        setTarget(t);

        // フォームに値をセット
        form.reset({
          name: t.name,
          type: t.type,
          vhost: t.vhost,
          wordpressPath: t.wordpressPath,
          sshHost: t.ssh?.host || "",
          sshUser: t.ssh?.user || "",
          sshPort: t.ssh?.port || 22,
          sshKeyPath: t.ssh?.keyPath || "",
          basicAuthUser: t.basicAuth?.user || "",
          basicAuthPassword: t.basicAuth?.password || "",
          monitoringEnabled: t.monitoring?.enabled ?? false,
          monitoringIntervalMinutes: t.monitoring?.intervalMinutes ?? 30,
          monitoringDiskPercent: t.monitoring?.thresholds?.diskUsagePercent ?? DEFAULT_MONITORING_THRESHOLDS.diskUsagePercent,
          monitoringSslDays: t.monitoring?.thresholds?.sslExpiryDays ?? DEFAULT_MONITORING_THRESHOLDS.sslExpiryDays,
          monitoringHttpMs: t.monitoring?.thresholds?.httpResponseMs ?? DEFAULT_MONITORING_THRESHOLDS.httpResponseMs,
          dbHost: t.database.host,
          dbName: t.database.name,
          dbUser: t.database.user,
          dbPassword: t.database.password || "",
          exclude: t.exclude?.join("\n") || "",
        });
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    }
    fetchTarget();
  }, [targetId, form]);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
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
        basicAuth: data.basicAuthUser
          ? { user: data.basicAuthUser, password: data.basicAuthPassword || "" }
          : null,
        monitoring: {
          enabled: data.monitoringEnabled ?? false,
          intervalMinutes: data.monitoringIntervalMinutes ?? 30,
          thresholds: {
            diskUsagePercent: data.monitoringDiskPercent ?? DEFAULT_MONITORING_THRESHOLDS.diskUsagePercent,
            sslExpiryDays: data.monitoringSslDays ?? DEFAULT_MONITORING_THRESHOLDS.sslExpiryDays,
            httpResponseMs: data.monitoringHttpMs ?? DEFAULT_MONITORING_THRESHOLDS.httpResponseMs,
          },
        },
        database: {
          host: data.dbHost,
          name: data.dbName,
          user: data.dbUser,
          password: data.dbPassword || "",
        },
        exclude: data.exclude
          ? data.exclude.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
      };

      const res = await fetch(`/api/deploy-targets/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "更新に失敗しました");
      }

      router.push("/deploy");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!target) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{submitError || "ターゲットが見つかりません"}</p>
        <Button className="mt-4" onClick={() => router.push("/deploy")}>
          戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">デプロイターゲット編集</h1>
        <p className="text-muted-foreground">
          「{target.name}」の設定を変更します
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 基本設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">基本設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

          {/* Basic認証（任意） */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic認証（任意）</CardTitle>
              <CardDescription>
                サイトに Basic 認証がかかっている場合に入力。稼働チェック時の 401 を回避します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="basicAuthUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ユーザー名</FormLabel>
                      <FormControl>
                        <Input placeholder="（任意）" autoComplete="off" {...field} />
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
                      <FormLabel>パスワード</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* データベース設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">データベース設定</CardTitle>
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

          {/* 監視設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">監視設定</CardTitle>
              <CardDescription>
                定期ヘルスチェックを有効にするとスケジューラが自動チェックし、異常時に通知します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="monitoringEnabled"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <span className="text-sm font-medium">監視を有効にする</span>
                    </label>
                  </FormItem>
                )}
              />

              {watchMonitoringEnabled && (
                <div className="space-y-4 pl-6 border-l-2 border-muted">
                  <FormField
                    control={form.control}
                    name="monitoringIntervalMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>チェック間隔（分）</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            {...field}
                            value={field.value ?? 30}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 30)}
                            className="w-32"
                          />
                        </FormControl>
                        <FormDescription>1〜1440分。推奨: 30分</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div>
                    <p className="text-sm font-medium mb-3">通知しきい値</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="monitoringDiskPercent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ディスク使用率 (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={99}
                                {...field}
                                value={field.value ?? 85}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 85)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monitoringSslDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SSL残り日数（日）</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                {...field}
                                value={field.value ?? 14}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 14)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monitoringHttpMs"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>HTTP応答時間 (ms)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={100}
                                max={60000}
                                {...field}
                                value={field.value ?? 3000}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3000)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 除外パターン */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">除外パターン</CardTitle>
              <CardDescription>
                同期から除外するファイル/フォルダのパターン（1行に1つ）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="exclude"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder={`vendor/\nsrc/\n*.map\n*.scss`}
                        className="font-mono text-sm min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      デフォルトで .git/, node_modules/, .DS_Store, *.log, .env は除外されます
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
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
