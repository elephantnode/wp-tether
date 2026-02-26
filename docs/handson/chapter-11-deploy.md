# 第10章：デプロイ・同期の考え方（ここから先の発展）

[← ハンズオン目次](README.md)

## 何をするか

「デプロイ」機能では **デプロイターゲット**（リモートの SSH/パス/DB 情報）を `data/deploy-targets.json` で持ち、**ファイル同期（rsync）** と **DB 同期（mysqldump + WP-CLI search-replace）** が API 経由で実行される、という設計だけ押さえます。

## なぜこう分かれているか

- サイト（Site）は「ローカルの1環境」、デプロイターゲット（DeployTarget）は「そのサイトをどこに同期するか」の1つ。1サイトに複数ターゲット（staging / production）を紐づけられる。
- rsync と DB 同期は別々の API（`/api/sync`, `/api/db-sync`）になっており、それぞれオプション（除外パターン、URL 置換、ユーザー含めるかなど）を渡せる。

## 手順（コードで流れを追うだけ）

- `src/lib/deploy-targets.ts`：デプロイターゲットの読み書き。
- `src/lib/sync.ts`：rsync の実行（SSH 経由）。
- `src/lib/db-sync.ts`：mysqldump のエクスポート／インポートと WP-CLI による URL 置換。
- `src/app/api/sync/route.ts` と `src/app/api/db-sync/route.ts`：上記を呼び出す API。

実際に手を動かす場合は、デプロイターゲットを1つ登録し、「ファイル同期」を実行してリモートにファイルが増えるか、または「DB同期」のオプションを変えて挙動の違いを確認するとよいです。

## SSH 認証方式の詳細

### 鍵認証（推奨）

`DeployTarget.ssh.keyPath` に秘密鍵を指定すると、SSH 実行時に `-i [keyPath]` が付く。`~/` 始まりは `os.homedir()` で展開される（`expandKeyPathForHost()`）。

```text
推奨鍵: ~/.ssh/id_ed25519  ← Ed25519（現在の標準）
旧来型: ~/.ssh/id_rsa       ← RSA（レガシー）
```

鍵ファイルのパーミッションが `600` でない場合、SSH は接続を拒否する。

```bash
chmod 600 ~/.ssh/id_ed25519
```

### SSH Agent（keyPath 未指定時）

`keyPath` が空の場合、`-i` フラグなしで SSH を実行する。`SSH_AUTH_SOCK` が設定されていれば **SSH Agent** が自動的に使われる。本ツールは Node.js からのバックグラウンド実行のためインタラクティブなパスワード入力はできない。パスワード認証が必要なサーバーには SSH Agent を使う。

### 接続テストの流れ

1. `testSSHConnection()` … `echo "Connection successful"` を SSH 越しに実行（タイムアウト 30 秒）
2. `validateRemotePath()` … `wp-config.php` の存在を確認
   - `{wordpressPath}/wp-config.php`（通常配置）
   - `{wordpressPath}/../wp-config.php`（KUSANAGI など親ディレクトリ配置に対応）

## SFTP / FTP 対応状況

`type: "ssh" | "sftp" | "ftp"` は型定義に含まれているが、現在ファイル同期（rsync）は **SSH のみ**サポート。SFTP・FTP は将来拡張用として設計されている。

## 孤児ターゲット（Orphan Targets）

サイトを削除しても `data/deploy-targets.json` のレコードは自動削除されない。存在しないサイトに紐づくターゲットを **孤児ターゲット** と呼ぶ。

`POST /api/cleanup/orphan-targets` を呼ぶと、`data/sites.json` に存在しないサイト ID を参照しているターゲットをまとめて削除できる。サイト削除後や定期メンテナンス時に実行することを推奨する。
