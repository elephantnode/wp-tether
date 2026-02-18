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
