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
  hostname: z
    .string()
    .min(1, "ホスト名を入力してください")
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "有効なホスト名を入力してください"),
  path: z
    .string()
    .min(1, "パスを入力してください"),
  port: z
    .number()
    .min(1024, "1024以上のポートを指定してください")
    .max(65535, "65535以下のポートを指定してください"),
  template: z.string().min(1, "テンプレートを選択してください"),
  wpVersion: z.string(),
  phpVersion: z.string(),
  dbType: z.enum(["mariadb", "mysql"]),
  dbVersion: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  hostname: "",
  path: "~/wp-sites",
  port: 8080,
  template: "default",
  wpVersion: "latest",
  phpVersion: "8.2",
  dbType: "mariadb",
  dbVersion: "10.6",
};

const dbTypes = [
  { value: "mariadb", label: "MariaDB" },
  { value: "mysql", label: "MySQL" },
];

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

  const isLoading = isLoadingVersions || isLoadingTemplates;

  // テンプレート選択時に詳細設定を自動入力
  function handleTemplateChange(templateId: string) {
    const template = getTemplate(templateId);
    if (template) {
      form.setValue("wpVersion", template.wordpress.version);
      form.setValue("phpVersion", template.php.version);
      form.setValue("dbType", template.database.type);
      form.setValue("dbVersion", template.database.version);
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
                          field.onChange(e);
                          // サイト名からホスト名を自動生成（未入力の場合）
                          const currentHostname = form.getValues("hostname");
                          if (!currentHostname || currentHostname === form.getValues("name") + ".test") {
                            form.setValue("hostname", e.target.value + ".test");
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
                name="hostname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ホスト名</FormLabel>
                    <FormControl>
                      <Input placeholder="my-blog.test" {...field} />
                    </FormControl>
                    <FormDescription>
                      オプション: /etc/hostsに追加すればSSLでアクセス可能
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                    <FormLabel>ポート番号</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      http://localhost:{field.value} でアクセスします
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
                      defaultValue={field.value}
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
                      {getTemplate(form.watch("template"))?.description}
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
