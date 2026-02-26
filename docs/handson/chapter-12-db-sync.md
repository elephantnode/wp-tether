# 第11章：DB 同期の仕組み

[← ハンズオン目次](README.md)

## 何をするか

ローカルとリモートの WordPress データベースを同期する **DB 同期** 機能の仕組みを理解します。Push（ローカル→リモート）と Pull（リモート→ローカル）の両方向に対応し、URL 置換やユーザーテーブル除外などのオプションがあります。

## なぜこの設計か

- **ファイル同期だけでは不足**：WordPress はデータ（投稿・設定など）を DB に持つため、themes/plugins だけ rsync しても本番と同じにならない。
- **URL 置換が必要**：WordPress は DB に絶対 URL を保存している（`siteurl`, `home`, 投稿内の画像パスなど）。ローカル（`localhost:8080`）と本番（`https://example.com`）で違うため、インポート後に置換が必要。
- **ユーザー除外オプション**：本番のユーザー情報をローカルに持ち込みたくない、またはローカルの admin をそのまま使いたい場合に `wp_users` / `wp_usermeta` を除外できる。

## 主なファイルと役割

| ファイル | 役割 |
|----------|------|
| `src/lib/db-sync.ts` | DB 同期のコアロジック（エクスポート・インポート・URL 置換） |
| `src/app/api/db-sync/route.ts` | POST /api/db-sync で同期を実行する API |

## 処理の流れ（Pull の場合）

1. **リモートの能力検出**：`detectRemoteCapabilities()` で、リモートに WP-CLI / mariadb-dump / mysqldump のどれがあるか SSH で確認。
2. **リモート DB エクスポート**：`exportRemoteDb()` で SQL ファイルを生成。WP-CLI があれば `wp db export`、なければ mariadb-dump/mysqldump を使用。
3. **ローカルに転送**：`scp` で SQL ファイルをローカルの一時ディレクトリに取得。
4. **ローカル DB インポート**：`importLocalDb()` で Docker コンテナ内の WP-CLI（`wp db import`）を使ってインポート。
5. **URL 置換**：`searchReplaceLocal()` で `wp search-replace` を実行し、リモート URL をローカル URL に置換。
6. **一時ファイル削除**：エクスポートした SQL ファイルを削除。

## `detectRemoteCapabilities()` の詳細フロー

この関数は SSH 越しに 4 つのコマンドを実行し、リモートサーバーの能力を自動検出する。

```
1. which wp         → WP-CLI の有無とパスを確認
2. which mysqldump  → mysqldump の有無を確認
3. which mariadb-dump → mariadb-dump の有無を確認
4. mysql ... SELECT VERSION() → DB の種類（MariaDB / MySQL）を判定
```

```typescript
// 戻り値の型
interface RemoteDbCapabilities {
  hasWpCli: boolean;
  wpCliPath?: string;        // 例: /usr/local/bin/wp
  hasMysqldump: boolean;
  hasMariadbDump: boolean;
  dbType: "mariadb" | "mysql" | "unknown";
}
```

**コマンド選択の優先順位**

| 優先度 | ツール | 選択理由 |
|--------|--------|---------|
| 1位 | **WP-CLI** (`wp db export`) | テーブルプレフィックスを自動認識、WordPress に最適化 |
| 2位 | **mariadb-dump** | MariaDB 環境での標準ツール |
| 3位 | **mysqldump** | MySQL / MariaDB 両対応のフォールバック |

`hasWpCli` が `true` の場合、エクスポートコマンドは `{wpCliPath} db export --allow-root - ` になる（stdout に SQL を出力）。

**キャッシュ**

検出結果は `DeployTarget.wpCli` フィールドに保存（`data/deploy-targets.json` に書き込み）されるため、2 回目以降の同期では SSH を省略できる。`?refresh=1` または明示的な再検出で更新できる。

## ポイント

### コマンドの優先順位

```
1. WP-CLI (wp db export/import) ← 推奨
2. mariadb-dump               ← MariaDB 環境
3. mysqldump                  ← MySQL 環境
```

WP-CLI はテーブルプレフィックスを自動認識し、WordPress に最適化されている。

### MariaDB のサンドボックスモード

MariaDB 11.5.2+ の `mariadb-dump` は先頭に `/*999999\- enable the sandbox mode */` というコメントを出力する。これを MySQL にインポートするとエラーになるため、`sanitizeMariaDbDump()` で除去している。

### シェルエスケープ

リモートでコマンドを実行する際、DB パスワードなどにシングルクォートが含まれる可能性がある。`shellEscape()` で `'` → `'\''` に変換し、シェルインジェクションを防ぐ。

## 確認

- デプロイターゲットを登録し、「DB 同期」→「Pull」を実行すると、ローカルの DB がリモートの内容で上書きされる。
- URL 置換後、ローカルサイトにアクセスして画像やリンクが正しく表示されることを確認。
- 「ユーザーテーブルを除外」にチェックを入れると、ローカルの admin ユーザーが維持される。
