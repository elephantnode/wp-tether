"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useDockerVersions } from "@/hooks/use-docker-versions";
import { useTemplates } from "@/hooks/use-templates";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z
    .string()
    .min(1, "サイト名を入力してください")
    .regex(/^[a-z0-9-]+$/, "小文字英数字とハイフンのみ使用できます"),
  hostnameMode: z.enum(["localhost", "custom"]),
  hostname: z
    .string()
    .optional(),
  path: z
    .string()
    .min(1, "パスを入力してください"),
  port: z
    .number()
    .min(1024, "1024以上のポートを指定してください")
    .max(65535, "65535以下のポートを指定してください")
    .optional(),
  template: z.string().min(1, "テンプレートを選択してください"),
  wpVersion: z.string(),
  phpVersion: z.string(),
  dbType: z.enum(["mariadb", "mysql"]),
  dbVersion: z.string(),
  // WordPress初期設定
  wpAdminUser: z.string().min(1, "管理者ユーザー名を入力してください"),
  wpAdminPassword: z.string().min(8, "8文字以上のパスワードを入力してください"),
  wpAdminEmail: z.string().email("有効なメールアドレスを入力してください"),
  wpLocale: z.string(),
  // マルチサイト
  multisiteEnabled: z.boolean(),
  multisiteType: z.enum(["subdomain", "subdirectory"]),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  hostnameMode: "custom",
  hostname: "",
  path: "~/wp-sites",
  port: undefined,
  template: "default",
  wpVersion: "latest",
  phpVersion: "8.3",  // テンプレートの default.yml に合わせる
  dbType: "mariadb",
  dbVersion: "10.6",
  // WordPress初期設定
  wpAdminUser: "admin",
  wpAdminPassword: "",
  wpAdminEmail: "admin@example.com",
  wpLocale: "ja",
  multisiteEnabled: false,
  multisiteType: "subdirectory",
};

const dbTypes = [
  { value: "mariadb", label: "MariaDB" },
  { value: "mysql", label: "MySQL" },
];

/**
 * ランダムなパスワードを生成（英数字 + 記号）
 */
function generateRandomPassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

export default function NewSitePage() {
  const router = useRouter();
  const { versions, isLoading: isLoadingVersions } = useDockerVersions();
  const { templates, isLoading: isLoadingTemplates, getTemplate } = useTemplates();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const watchDbType = form.watch("dbType");
  const dbVersions = watchDbType === "mysql" ? versions.mysql : versions.mariadb;
  const watchDbVersion = form.watch("dbVersion");

  const isLoading = isLoadingVersions || isLoadingTemplates;

  // dbTypeが変わったときに、dbVersionが新しいリストに存在しない場合は最初のバージョンを設定
  useEffect(() => {
    if (dbVersions.length > 0 && watchDbVersion && !dbVersions.includes(watchDbVersion)) {
      form.setValue("dbVersion", dbVersions[0], { shouldValidate: false });
    }
  }, [watchDbType, dbVersions, watchDbVersion]);

  // 初回マウント時にランダムパスワードを生成
  useEffect(() => {
    const currentPassword = form.getValues("wpAdminPassword");
    if (!currentPassword) {
      form.setValue("wpAdminPassword", generateRandomPassword());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // テンプレート選択時に詳細設定を自動入力
  function handleTemplateChange(templateId: string) {
    const template = getTemplate(templateId);
    if (template) {
      const currentValues = form.getValues();
      const newDbType = template.database.type;
      const newDbVersions =
        newDbType === "mysql" ? versions.mysql : versions.mariadb;
      
      // dbTypeが変わる場合は、新しいdbTypeのバージョンリストを確認
      let dbVersion = template.database.version;
      if (currentValues.dbType !== newDbType) {
        // dbTypeが変わった場合、テンプレートのdbVersionが新しいリストに存在するか確認
        if (!newDbVersions.includes(dbVersion) && newDbVersions.length > 0) {
          dbVersion = newDbVersions[0];
        }
      }
      
      // 全ての値を一度にリセットして更新
      form.reset({
        ...currentValues,
        wpVersion: template.wordpress.version,
        phpVersion: template.php.version,
        dbType: newDbType,
        dbVersion: dbVersion,
      });
    }
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "サイトの作成に失敗しました");
      }

      router.push("/");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">新規サイト作成</h1>
        <p className="text-muted-foreground">
          WordPressローカル環境を作成します
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 基本設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                基本設定
                {isLoadingTemplates && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サイト名</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="my-blog"
                        {...field}
                        onChange={(e) => {
                          const newName = e.target.value;
                          const oldName = form.getValues("name");
                          field.onChange(e);
                          // カスタムホスト名モードの場合のみ、サイト名からホスト名を自動生成
                          if (form.getValues("hostnameMode") === "custom") {
                            const currentHostname = form.getValues("hostname");
                            if (!currentHostname || currentHostname === oldName + ".test") {
                              form.setValue("hostname", newName + ".test");
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      小文字英数字とハイフンのみ（例: my-blog）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hostnameMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>アクセス方法</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="localhost">localhost:port（簡単・設定不要）</SelectItem>
                        <SelectItem value="custom">カスタムホスト名（要 /etc/hosts）</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === "localhost"
                        ? "http://localhost:8080 のようなURLでアクセスします"
                        : "mysite.test のようなカスタムドメインでアクセスします（HTTPSも利用可）"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("hostnameMode") === "custom" && (
                <FormField
                  control={form.control}
                  name="hostname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ホスト名</FormLabel>
                      <FormControl>
                        <Input placeholder="my-blog.test" {...field} />
                      </FormControl>
                      <FormDescription>
                        /etc/hosts に追加するホスト名（例: my-blog.test）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ローカルパス</FormLabel>
                    <FormControl>
                      <Input placeholder="~/wp-sites" {...field} />
                    </FormControl>
                    <FormDescription>
                      サイトファイルの保存先（{field.value}/{form.watch("name") || "サイト名"}）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ポート番号（オプション）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="自動生成"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? undefined : Number(value));
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      未指定の場合は自動生成されます（WordPressサイト識別用、実際のアクセスはポート番号不要）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>テンプレート</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleTemplateChange(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="テンプレートを選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {getTemplate(field.value)?.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* 詳細設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                詳細設定
                {isLoading && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                テンプレートの設定を上書きできます
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WordPress</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {versions.wordpress.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : v}
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
                  name="phpVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PHP</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {versions.php.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : `PHP ${v}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dbType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>データベース</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // DBタイプ変更時にバージョンをリセット
                          const newVersions =
                            value === "mysql" ? versions.mysql : versions.mariadb;
                          if (newVersions.length > 0) {
                            form.setValue("dbVersion", newVersions[0]);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dbTypes.map((v) => (
                            <SelectItem key={v.value} value={v.value}>
                              {v.label}
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
                  name="dbVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DBバージョン</FormLabel>
                      <Select
                        key={watchDbType}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dbVersions.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v === "latest" ? "Latest" : v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* WordPress初期設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">WordPress初期設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                サイト作成時にWordPressを自動セットアップします
              </p>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpAdminUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者ユーザー名</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wpAdminPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者パスワード</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="8文字以上" {...field} className="font-mono" />
                      </FormControl>
                      <FormDescription>自動生成済み。必要に応じて変更可</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="wpAdminEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理者メールアドレス</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="admin@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wpLocale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>言語</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ja">日本語</SelectItem>
                          <SelectItem value="en_US">English (US)</SelectItem>
                          <SelectItem value="en_GB">English (UK)</SelectItem>
                          <SelectItem value="zh_CN">中文 (简体)</SelectItem>
                          <SelectItem value="zh_TW">中文 (繁體)</SelectItem>
                          <SelectItem value="ko_KR">한국어</SelectItem>
                          <SelectItem value="de_DE">Deutsch</SelectItem>
                          <SelectItem value="fr_FR">Français</SelectItem>
                          <SelectItem value="es_ES">Español</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* マルチサイト設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">マルチサイト</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="multisiteEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>マルチサイト（WordPress Network）を有効にする</FormLabel>
                      <FormDescription>
                        単一の WordPress インストールで複数サイトを管理できます
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("multisiteEnabled") && (
                <div className="space-y-4 pl-7">
                  <FormField
                    control={form.control}
                    name="multisiteType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ネットワーク種別</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="subdirectory">サブディレクトリ（例: example.test/site2）</SelectItem>
                            <SelectItem value="subdomain">サブドメイン（例: site2.example.test）</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("multisiteType") === "subdomain" &&
                    form.watch("hostnameMode") === "localhost" && (
                    <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                      <strong>注意:</strong>{" "}
                      localhostモードではサブドメインマルチサイトは動作しません。
                      上の「アクセス方法」をカスタムホスト名に切り替えてください。
                    </div>
                  )}

                  {form.watch("multisiteType") === "subdomain" &&
                    form.watch("hostnameMode") === "custom" && (
                    <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                      <p className="font-semibold">サブドメイン型に必要な追加設定</p>
                      <p>以下は自動で対応します：</p>
                      <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                        <li>mkcert でワイルドカード証明書（<code>*.{form.watch("hostname") || "example.test"}</code>）を発行</li>
                        <li>Caddyfile にワイルドカードブロックを追加</li>
                      </ul>
                      <p className="mt-1">以下は手動設定が必要です（DNS ワイルドカード）：</p>
                      {(() => {
                        const h = form.watch("hostname") || "example.test";
                        const tld = h.split(".").pop() ?? "test";
                        return (
                          <pre className="text-xs bg-blue-100 rounded p-2 leading-relaxed whitespace-pre-wrap">{`# dnsmasq をインストール（初回のみ）
brew install dnsmasq

# *.${h} を 127.0.0.1 に解決
echo 'address=/.${h}/127.0.0.1' >> /opt/homebrew/etc/dnsmasq.conf
sudo brew services restart dnsmasq

# macOS に .${tld} ドメインのリゾルバを登録（初回のみ）
sudo mkdir -p /etc/resolver
sudo sh -c "echo 'nameserver 127.0.0.1' > /etc/resolver/${tld}"`}</pre>
                        );
                      })()}
                      <p className="text-xs text-blue-500">/etc/hosts はワイルドカードに対応していないため dnsmasq が必要です。</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* エラー表示 */}
          {submitError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {submitError}
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isSubmitting ? "作成中..." : "作成"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/")}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
