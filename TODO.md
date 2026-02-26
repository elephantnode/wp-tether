# Project TODO

> Last updated: 2026-02-19
> Session ID: cdf94ec4-da36-496f-a30b-fc1262f833c4

## Completed Tasks

このセッションで完了したタスク:

- [x] ハンズオン Caddy セクション追加 - `chapter-08-docker-compose.md` に Caddy リバースプロキシ・mkcert・HTTPS の解説を追加
- [x] Step 3 Caddyfile 生成の解説追加 - `step-03-site-creation.md` に 3-2b (カスタムホスト名モード) を追加
- [x] Step 3 WP-CLI バックグラウンドセットアップ解説 - `step-03-site-creation.md` に 3-3b を追加（waitForWpConfig/waitForDatabase/wp core install フロー）
- [x] Step 3 Mailpit 解説追加 - `step-03-site-creation.md` に 3-3c を追加（ポート計算式・SMTP設定）
- [x] Step 6 同期モード解説追加 - `step-06-deploy.md` に mirror/additive/update の使い分け表を追加
- [x] Step 8 DB バックアップ一覧・復元 API 解説追加 - `step-08-db-sync.md` に 8-5 を追加（before_pull.sql・cleanupOldBackups・パストラバーサル保護）
- [x] Step 9 --no-tls-verify 解説追加 - `step-09-tunnel-security.md` に cloudflared の自動フラグ付与を説明
- [x] Step 9 動的 URL 注入解説追加 - `step-09-tunnel-security.md` に 9-3b を追加（ensureDynamicUrlConfig・HTTP_X_FORWARDED_HOST）
- [x] Step 9 セキュリティスキャンキャッシュ解説追加 - `step-09-tunnel-security.md` に 9-8b を追加（security-scan-cache.json・?refresh=1）

## In Progress Tasks

作業中だが未完了のタスク:

- [ ] なし

## Pending Tasks

（主要な漏れはすべて対応済み。以下は将来的な改善候補のみ）

### 将来的な改善候補

- [ ] バックアップの自動削除（古いバックアップの管理）
- [ ] DB同期時のテーブル選択機能
- [ ] 複数サイトの一括操作

## Next Session Starting Point

次回セッション開始時に最初に確認・実行すべきこと:

1. 将来的な改善候補（下記）から着手するか、新機能実装を優先するか確認
2. ハンズオン資料は主要な漏れをすべて対応済み

## Environment & Commands

### Node.js
- Node version: 20以上推奨
- Package manager: npm
- Install: `npm install`
- Scripts:
  - `npm run dev` - 開発サーバー起動 (http://localhost:3000)
  - `npm run build` - プロダクションビルド
  - `npm run lint` - ESLint実行

### TypeScript
- Config: `tsconfig.json`
- 型チェック: `npx tsc --noEmit`

### Docker
- 各サイトは独立したDocker Compose環境
- WP-CLIコンテナは Alpine Linux ベース（`apk`を使用）

### データファイル
- `data/sites.json` - サイト情報
- `data/deploy-targets.json` - デプロイターゲット情報
- `data/plugin-presets.json` - プラグインプリセット
- `data/security-scan-cache.json` - セキュリティスキャンキャッシュ

## Notes

### 技術的注意点

1. **DB同期の優先順位**: WP-CLI → mariadb-dump → mysqldump
2. **rsync デフォルト除外**: `.git/`, `node_modules/`, `.DS_Store`, `*.log`, `.env`
3. **MariaDB ダンプ**: `/*999999- enable the sandbox mode */` コメントは自動除去が必要
4. **Caddy + mkcert**: mkcert がない場合は `tls internal` にフォールバック
5. **WP-CLI バックグラウンドセットアップ**: API は 201 を即返し、非同期 IIFE でステータスを "creating" → "running" に更新
6. **Mailpit ポート**: `site.port + 1000`（例: サイトポート 10080 → Mailpit Web UI 11080）
7. **cloudflared --no-tls-verify**: HTTPS サイトのトンネル時に自動付与
8. **セキュリティスキャンキャッシュ**: `?refresh=1` で強制再スキャン

### ハンズオン文書の構成

- `docs/handson/README.md` - 目次
- `docs/handson/step-01-foundation.md` - 基礎知識（Docker・WordPress）
- `docs/handson/step-03-site-creation.md` - サイト作成 API（Caddy・WP-CLI・Mailpit）
- `docs/handson/step-04-start-stop.md` - 起動・停止
- `docs/handson/step-05-templates-and-delete.md` - テンプレート・削除
- `docs/handson/step-06-deploy.md` - デプロイ（rsync 同期モード）
- `docs/handson/step-07-other.md` - その他機能
- `docs/handson/step-08-db-sync.md` - DB同期（バックアップ一覧・復元 API）
- `docs/handson/step-09-tunnel-security.md` - トンネル・セキュリティスキャン
- `docs/handson/chapter-*.md` - 詳細解説 chapter 群

### 重要な決定事項

- リモートバックアップは `~/wp-tether-backups/{site-name}_{site-id}/{target-name}/` に保存（Webルート外）
- ローカルバックアップは `{site-path}/backups/db/` に保存（最大5件、cleanupOldBackups）
- インポートモード: マージ（追加・更新）と上書き（完全置換）の2種類
