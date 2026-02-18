# 第2章：Next.js プロジェクトの雛形を理解する

[← ハンズオン目次](README.md)

## 何をするか

このプロジェクトが **Next.js 16（App Router）** でどう構成されているかを、ディレクトリと主要ファイルで押さえます。

## なぜこの構成か

- **App Router**：`app/` 配下のフォルダがそのまま URL になる。`app/page.tsx` → `/`、`app/sites/new/page.tsx` → `/sites/new`。従来の `pages/` よりレイアウト・データ取得の扱いが分かりやすい。
- **TypeScript**：型で「サイト」「デプロイ先」などのデータ構造が明確になり、API と画面の間でミスを減らせる。
- **Tailwind CSS**：クラスでスタイルを書く。shadcn/ui は Tailwind 前提のコンポーネント集なので、見た目を揃えやすい。

## 手順（既存プロジェクトの構造確認）

プロジェクトルートで以下を実行し、どのファイルがどこにあるか見てみます。

```bash
# アプリの入口とルート
ls -la src/app/
# layout.tsx = 全ページ共通のレイアウト（サイドバーなど）
# page.tsx   = トップページ (/)
# globals.css = 全体のCSS（Tailwindの読み込み）

# 代表的なページ
ls -la src/app/sites/new/
ls -la src/app/deploy/
ls -la src/app/settings/
```

## 押さえておくポイント

| パス | 役割 |
|------|------|
| `src/app/layout.tsx` | 全ページ共通。SidebarProvider + AppSidebar + メイン領域。 |
| `src/app/page.tsx` | ダッシュボード。サイト一覧を表示。 |
| `src/app/sites/new/page.tsx` | 新規サイト作成フォーム（クライアントコンポーネント）。 |
| `src/app/api/*` | API Route。GET/POST などで JSON を返す。ブラウザやフォームから `fetch('/api/...')` で呼ぶ。 |

**ゼロから再現する場合**：別ディレクトリで `npx create-next-app@latest` を実行し、App Router + TypeScript + Tailwind を選ぶ。生成された `app/layout.tsx` と `app/page.tsx` を開き、どのように「ページ」ができているか確認する。
