"use client";

import { useFormContext } from "react-hook-form";
import { z } from "zod";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_MONITORING_THRESHOLDS, MonitoringConfig } from "@/types";

/**
 * 監視設定のフォームスキーマ断片。
 * デプロイターゲットと保守サーバーの両フォームで展開して使う。
 */
export const monitoringFormSchema = {
  monitoringEnabled: z.boolean().optional(),
  monitoringIntervalMinutes: z.number().min(1).max(1440).optional(),
  monitoringDiskPercent: z.number().min(1).max(99).optional(),
  monitoringSslDays: z.number().min(1).max(365).optional(),
  monitoringHttpMs: z.number().min(100).max(60000).optional(),
};

export const DEFAULT_MONITORING_INTERVAL_MINUTES = 30;

export interface MonitoringFormValues {
  monitoringEnabled?: boolean;
  monitoringIntervalMinutes?: number;
  monitoringDiskPercent?: number;
  monitoringSslDays?: number;
  monitoringHttpMs?: number;
}

export const monitoringDefaultValues: Required<MonitoringFormValues> = {
  monitoringEnabled: false,
  monitoringIntervalMinutes: DEFAULT_MONITORING_INTERVAL_MINUTES,
  monitoringDiskPercent: DEFAULT_MONITORING_THRESHOLDS.diskUsagePercent,
  monitoringSslDays: DEFAULT_MONITORING_THRESHOLDS.sslExpiryDays,
  monitoringHttpMs: DEFAULT_MONITORING_THRESHOLDS.httpResponseMs,
};

/** 既存の MonitoringConfig をフォーム初期値に変換する */
export function monitoringToFormValues(
  monitoring: MonitoringConfig | undefined
): Required<MonitoringFormValues> {
  return {
    monitoringEnabled: monitoring?.enabled ?? monitoringDefaultValues.monitoringEnabled,
    monitoringIntervalMinutes:
      monitoring?.intervalMinutes ?? monitoringDefaultValues.monitoringIntervalMinutes,
    monitoringDiskPercent:
      monitoring?.thresholds?.diskUsagePercent ?? monitoringDefaultValues.monitoringDiskPercent,
    monitoringSslDays:
      monitoring?.thresholds?.sslExpiryDays ?? monitoringDefaultValues.monitoringSslDays,
    monitoringHttpMs:
      monitoring?.thresholds?.httpResponseMs ?? monitoringDefaultValues.monitoringHttpMs,
  };
}

/** フォーム値から API 送信用の MonitoringConfig を組み立てる */
export function buildMonitoringConfig(data: MonitoringFormValues): MonitoringConfig {
  return {
    enabled: data.monitoringEnabled ?? monitoringDefaultValues.monitoringEnabled,
    intervalMinutes:
      data.monitoringIntervalMinutes ?? monitoringDefaultValues.monitoringIntervalMinutes,
    thresholds: {
      diskUsagePercent:
        data.monitoringDiskPercent ?? monitoringDefaultValues.monitoringDiskPercent,
      sslExpiryDays: data.monitoringSslDays ?? monitoringDefaultValues.monitoringSslDays,
      httpResponseMs: data.monitoringHttpMs ?? monitoringDefaultValues.monitoringHttpMs,
    },
  };
}

/**
 * 監視設定カード。
 * 親フォームが shadcn の <Form {...form}>（FormProvider）で囲んでいることを前提に
 * useFormContext から control を取得する。
 */
export function MonitoringFields() {
  const form = useFormContext<MonitoringFormValues>();
  const enabled = form.watch("monitoringEnabled");

  return (
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
                  <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
                <span className="text-sm font-medium">監視を有効にする</span>
              </label>
            </FormItem>
          )}
        />

        {enabled && (
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
                      value={field.value ?? monitoringDefaultValues.monitoringIntervalMinutes}
                      onChange={(e) =>
                        field.onChange(
                          parseInt(e.target.value, 10) ||
                            monitoringDefaultValues.monitoringIntervalMinutes
                        )
                      }
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
                          value={field.value ?? monitoringDefaultValues.monitoringDiskPercent}
                          onChange={(e) =>
                            field.onChange(
                              parseInt(e.target.value, 10) ||
                                monitoringDefaultValues.monitoringDiskPercent
                            )
                          }
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
                          value={field.value ?? monitoringDefaultValues.monitoringSslDays}
                          onChange={(e) =>
                            field.onChange(
                              parseInt(e.target.value, 10) ||
                                monitoringDefaultValues.monitoringSslDays
                            )
                          }
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
                          value={field.value ?? monitoringDefaultValues.monitoringHttpMs}
                          onChange={(e) =>
                            field.onChange(
                              parseInt(e.target.value, 10) ||
                                monitoringDefaultValues.monitoringHttpMs
                            )
                          }
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
  );
}
