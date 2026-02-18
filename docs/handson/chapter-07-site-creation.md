# 第6章：新規サイト作成の流れ（フォーム → API → ファイル生成）

[← ハンズオン目次](README.md)

## 何をするか

「新規サイト作成」で入力した内容が、**POST /api/sites** で受け取られ、**ディレクトリと設定ファイルを生成**し、**Docker で起動**されるまでを追います。

## なぜこの流れか

- フォーム（React Hook Form + Zod）でバリデーションし、送信内容を型安全に API に渡す。
- API 側で「1サイト = 1フォルダ」を作り、その中に `docker-compose.yml`・`.env`・`Caddyfile`・`php/custom.ini` などを置く。そうすることで、どのサイトも同じ手順で起動・停止できる。

## 手順

1. **フォーム送信先を確認**

`src/app/sites/new/page.tsx` で、送信時に `fetch('/api/sites', { method: 'POST', body: JSON.stringify(...) })` をしている部分を探す。

2. **POST の処理を追う**

`src/app/api/sites/route.ts` の `export async function POST(request)` を上から読む。

- リクエスト body から name, path, hostnameMode, template, 各種バージョンなどを取得。
- ポート番号の重複チェック、既存サイトとの名前重複チェック。
- `expandPath(body.path)` で `~/wp-sites` をホームディレクトリに展開。
- サイト用ディレクトリを作成：`sitePath/src`, `php`, `docker/wpcli`, `certs` など。
- **docker-compose.ts** の関数で中身を生成：
  - `generateDockerCompose()` → `docker-compose.yml`
  - `generateEnvFile()` → `.env`
  - `generateCaddyfile()` → `Caddyfile`
  - `generatePhpIni()` → `php/custom.ini`
  - `generateWpcliDockerfile()` → `docker/wpcli/Dockerfile`
- カスタムホスト名のときは `mkcert` で証明書を `certs/` に生成。
- `Site` オブジェクトを作り `addSite(site)` で `data/sites.json` に追加。
- その後 **バックグラウンド** で `docker compose up -d` → wp-config 待ち → DB 待ち → `wp core install`（未インストール時）→ 言語パックなど。

「フォーム → POST → ファイル生成 → addSite → 非同期でコンテナ起動・WP セットアップ」という一連の流れが、この1本の API にまとまっています。

## 確認

- 画面上で「新規サイト作成」から必要な項目を入力し、作成する。
- 指定した path（例: `~/wp-sites`）の下にサイト名のフォルダができ、その中に `docker-compose.yml` などが並んでいることを確認する。
- ダッシュボードで当該サイトの状態が「起動中」になり、ブラウザでアクセスできること。
