# wp-tether

WordPress ローカル開発環境管理ツール（Local by Flywheel / MAMP 代替）

## 技術スタック
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Docker Compose

## 開発コマンド
```bash
npm run dev      # 開発サーバー起動 (http://localhost:3000)
npm run build    # プロダクションビルド
npm run lint     # ESLint実行
```

## アーキテクチャ

### サイト管理
- 各WordPressサイトは独立したディレクトリに作成
- Docker Compose で WordPress + DB + Mailpit + WP-CLI を起動
- Caddy によるリバースプロキシ（カスタムホスト名モード時）

### デプロイ機能
- SSH + rsync によるリモートサーバーとのファイル同期
- 同期対象: themes, plugins, uploads, mu-plugins, languages
- 同期モード: mirror / additive / update

## 注意点

### WP-CLI コンテナ
`wordpress:cli` は Alpine Linux ベース。パッケージインストールには `apk` を使用。

### Next.js 16
`useSearchParams()` は必ず Suspense でラップする。

## データ
- `data/sites.json` - サイト情報
- `data/deploy-targets.json` - デプロイターゲット情報
