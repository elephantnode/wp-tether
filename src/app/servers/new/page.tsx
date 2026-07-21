"use client";

import { ServerForm } from "@/components/server-form";

export default function NewServerPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">保守サーバー追加</h1>
        <p className="text-muted-foreground">
          ローカル開発環境が無いサーバーも登録できます。監視・セキュリティチェック・更新メンテナンス・バックアップが利用可能になります
        </p>
      </div>

      <ServerForm mode="create" />
    </div>
  );
}
