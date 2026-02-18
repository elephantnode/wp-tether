# 第5章：ダッシュボード画面（一覧を表示する）

[← ハンズオン目次](README.md)

## 何をするか

トップページ（`/`）で「サイト一覧」を表示している部分を、**Server Component** と **コンポーネント** の役割で理解します。

## なぜ Server Component か

- `app/page.tsx` はサーバー側で実行される。その中で `getSites()` を直接呼べるので、**API を経由せず** 同じ `lib/sites.ts` でデータを取得できる。
- 一覧表示だけならクライアントで state を管理する必要がなく、シンプルで速い。

## 手順

1. **トップページのコードを読む**

`src/app/page.tsx` を開きます。

- `export default async function Dashboard()` で、`getSites()` を await している。
- 取得した `sites` を `displaySites` に変換し、`SiteCard` に渡して並べている。

2. **SiteCard を見る**

`src/components/site-card.tsx` を開きます。

- 各サイトの名前・状態・ホスト名・ポート・起動/停止ボタンなどを受け取り、表示している。
- 起動/停止は `fetch('/api/sites/[id]/start')` や `stop` を呼ぶ。

ここまでで「page.tsx（Server）が getSites() → SiteCard に渡す → カードが API で操作」という流れがつかめます。

## 確認

- http://localhost:3000 でサイト一覧が表示される。
- `data/sites.json` にサイトが入っていれば、その分カードが並ぶ。
