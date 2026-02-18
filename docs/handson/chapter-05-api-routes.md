# 第4章：API ルート（サイト一覧を返す）

[← ハンズオン目次](README.md)

## 何をするか

ブラウザやフォームから「サイト一覧をください」とリクエストしたときに、**Next.js の API Route** が `getSites()` を呼び、JSON で返す流れを追います。

## なぜ API ルートか

- フロント（React）は「データ取得」を `fetch('/api/sites')` のように書く。サーバー側でファイルシステム（`data/sites.json`）や Docker に触れる。
- `app/api/sites/route.ts` に **GET** と **POST** を実装すると、`/api/sites` がそのまま REST 風のエンドポイントになる。

## 手順

1. **GET の実装を読む**

`src/app/api/sites/route.ts` を開きます。

- `export async function GET()` で、`getSitesWithActualStatus()` を呼び、`NextResponse.json({ sites })` で返している。
- `getSitesWithActualStatus()` は `lib/sites.ts` で、各サイトのディレクトリで `docker compose ps` を実行し、実際の稼働状態（running/stopped）を付けて返す。

2. **ブラウザで叩いてみる**

開発サーバー起動中に、ブラウザで http://localhost:3000/api/sites を開く。  
JSON で `{ "sites": [ ... ] }` が返れば、API が「データ層（sites.ts）→ JSON レスポンス」でつながっていることが確認できます。

## 確認

- `/api/sites` にアクセスして JSON が返る。
- `data/sites.json` を変更すると、再読み込みでその内容が反映される（getSites がそのファイルを読んでいるため）。
