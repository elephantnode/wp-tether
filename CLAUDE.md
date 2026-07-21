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

### サーバー保守機能（/servers）
接続先サーバー（SSH+WP-CLI）の監視・保守を行う。共通SSH基盤の上にローカル向け監視・セキュリティ資産をリモート展開した構成。
- 共通SSH実行: `src/lib/remote-exec.ts`（`executeRemoteCommand` / `runWpCli` / `testConnection`）
- 監視: `src/lib/server-monitor.ts`（HTTP稼働 / SSL期限 / ディスク / メモリ・ロード / WPヘルス・更新件数）
- セキュリティ: `src/lib/remote-security.ts`（バージョン / CVE / コア・プラグインchecksum / ファイル権限 / マルウェアgrep / HTTPヘッダ / 露出 / wp-config）
- メンテ: `src/lib/remote-maintenance.ts`（更新プレビュー / 事前バックアップ付き一括更新 / メンテモード / WP-CLIランナー）
- 運用: `src/lib/remote-ops.ts`（debug.log/PHP errorログ閲覧 / WP-Cron一覧・実行 / DBバックアップ）
- 定期実行: `src/instrumentation.ts` + `src/lib/scheduler.ts`（setInterval。監視有効サーバーを間隔ごとにチェック、状態変化時のみ通知、1日1回DBバックアップ）
- 通知: `src/lib/notify.ts`（macOS通知 / Webhook / アプリ内 data/notifications.json）
- 資格情報暗号化: `src/lib/secrets.ts`（AES-256-GCM、鍵は `~/.wp-tether/secret.key`。deploy-targets.json のDB/FTPパスワードを暗号化保存。平文値も後方互換で読める）

#### サーバー登録の2経路
`DeployTarget` は「サイト紐付けデプロイターゲット」と「保守専用サーバー」を兼ねる。

| | サイト紐付け | 保守専用 |
|---|---|---|
| 登録UI | `/deploy/new` | `/servers/new`（`src/components/server-form.tsx`） |
| API | `POST /api/deploy-targets` | `POST /api/servers` |
| `siteId` | 必須 | 無し |
| `database` / `exclude` | 有り | 無し |
| 使える機能 | デプロイ + 保守 | 保守のみ |

- `siteId` / `database` / `exclude` は全て optional。保守専用サーバーでは未設定のまま保持する（`[]` や `{}` を作らない）
- `database` を使うのは全て WP-CLI 不在時のフォールバック分岐。`db-sync.ts` の `requireDatabase()` で明示エラーにする
- `/servers` の一覧・scheduler の絞り込みは `type === "ssh"` で行う。**`managed` では絞らない**（既存ターゲットが監視から消えるため）。`managed` は表示用
- 監視設定フォームは `src/components/monitoring-fields.tsx` に共通化（スキーマ断片・既定値・`MonitoringConfig` 組み立てを集約）
- `db-sync` / `db-backups` / `restore` は `siteId` 必須。保守専用サーバーには 400 を返す（保守側のバックアップは `remote-ops.ts` の `$HOME/wp-tether-maintenance-backups/{name}` 系統）

## 注意点

### WP-CLI コンテナ
`wordpress:cli` は Alpine Linux ベース。パッケージインストールには `apk` を使用。

### Next.js 16
`useSearchParams()` は必ず Suspense でラップする。

## データ
- `data/sites.json` - サイト情報
- `data/deploy-targets.json` - デプロイターゲット情報（DB/FTPパスワードは暗号化保存）
- `data/monitoring/{targetId}.json` - サーバーヘルスチェックのキャッシュ
- `data/security/{targetId}.json` - リモートセキュリティスキャンのキャッシュ
- `data/notifications.json` - アプリ内通知の履歴

## 実装済み機能
- サイト管理（作成・起動・停止・削除）
- テンプレート選択（MariaDB / MySQL 8.0）
- カスタムホスト名 + SSL（Caddy + mkcert）
- WP-CLI自動インストール
- rsyncファイル同期（Push/Pull、除外パターンUI）
- DB同期（Push/Pull、URL置換、ユーザー除外オプション）
- サーバー保守（監視・セキュリティ・更新メンテ・ログ/Cron・定期バックアップ・通知）
- 保守専用サーバー登録（ローカル開発環境なしで外部サーバーを保守対象に追加）
