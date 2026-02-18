# Project TODO

> Last updated: 2026-02-13
> Session ID: f6b32bfd-7a03-41b8-883b-e5d8f3eb73c1

## Completed Tasks

このセッションで完了したタスク:

- [x] リモートバックアップパスにサイトIDを追加 - 日本語サイト名でも一意性を保証 (`~/wp-tether-backups/{site-name}_{site-id}/{target-name}/`)
- [x] 設定のエクスポート/インポート機能 - サイト一覧・デプロイターゲットをJSON形式でダウンロード/アップロード
- [x] 孤児データクリーンアップ機能 - 削除されたサイトに紐づくデプロイターゲットを自動削除
- [x] プラグインプリセット機能 - 設定画面でプラグインリストを登録、サイトに一括インストール
- [x] ローカルDB復元機能 - UIからバックアップを選択して復元
- [x] リモートDB復元機能 - リモートサーバーのバックアップから復元
- [x] リモートバックアップをWebルート外に移動 - セキュリティ改善

## In Progress Tasks

作業中だが未完了のタスク:

- [ ] なし

## Pending Tasks

将来的な改善候補:

- [ ] バックアップの自動削除（古いバックアップの管理）
- [ ] DB同期時のテーブル選択機能
- [ ] 複数サイトの一括操作
- [ ] サイトテンプレート機能（設定のプリセット）

## Next Session Starting Point

次回セッション開始時に確認すべきこと:

1. リモートDB復元機能が正常に動作するか確認（前回修正した`find+stat`コマンド）
2. 設定画面のエクスポート/インポートが正常に動作するか確認
3. 孤児データクリーンアップが実行されたか確認

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

## Notes

### 技術的注意点

1. **DB同期の優先順位**: WP-CLI → mariadb-dump → mysqldump
2. **rsync デフォルト除外**: `.git/`, `node_modules/`, `.DS_Store`, `*.log`, `.env`
3. **MariaDB ダンプ**: `/*999999- enable the sandbox mode */` コメントは自動除去が必要
4. **クロスプラットフォーム**: GNU stat と BSD stat の差異に注意（find+stat で吸収済み）

### 最近のコミット

- `cecee32` feat: 設定のエクスポート/インポート機能と孤児データクリーンアップを追加
- `40d8bcd` fix: リモートバックアップパスにサイトIDを追加して一意性を保証
- `69aa106` fix: リモートバックアップ一覧取得をfind+statに変更
- `6ca6462` fix: リモートバックアップパスのチルダ展開問題を修正

### 重要な決定事項

- リモートバックアップは `~/wp-tether-backups/{site-name}_{site-id}/{target-name}/` に保存（Webルート外）
- ローカルバックアップは `{site-path}/backups/db/` に保存
- インポートモード: マージ（追加・更新）と上書き（完全置換）の2種類
