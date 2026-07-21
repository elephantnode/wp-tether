"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { DeployTarget } from "@/types";
import {
  ServerForm,
  ServerFormValues,
  targetToServerFormValues,
} from "@/components/server-form";

export default function EditServerPage() {
  const router = useRouter();
  const params = useParams();
  const targetId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<ServerFormValues | null>(null);

  useEffect(() => {
    async function fetchTarget() {
      try {
        const res = await fetch(`/api/deploy-targets/${targetId}`);
        if (!res.ok) {
          throw new Error("サーバーが見つかりません");
        }
        const data = await res.json();
        const t: DeployTarget = data.target;
        setInitialValues(targetToServerFormValues(t));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    }
    fetchTarget();
  }, [targetId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!initialValues) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{loadError || "サーバーが見つかりません"}</p>
        <Button className="mt-4" onClick={() => router.push("/servers")}>
          戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">保守サーバー編集</h1>
        <p className="text-muted-foreground">接続情報と監視設定を更新します</p>
      </div>

      <ServerForm mode="edit" targetId={targetId} initialValues={initialValues} />
    </div>
  );
}
