# 第8章：起動・停止と「実際の状態」

[← ハンズオン目次](README.md)

## 何をするか

「起動」「停止」ボタンが **API** を呼び、その API が **docker compose up/down** を実行する流れと、**表示上の状態**が「実際のコンテナ状態」と一致する仕組みを理解します。

## なぜ「実際の状態」を取るか

- ユーザーがターミナルで `docker compose down` したなど、アプリの外で状態が変わることがある。
- そのため、一覧取得時に `getSitesWithActualStatus()` で各サイトのディレクトリに対して `docker compose ps` を実行し、WordPress コンテナが running かどうかで status を上書きしている。

## 手順

1. **起動 API を読む**

`src/app/api/sites/[id]/start/route.ts` を開く。  
`id` でサイトを特定し、`site.path` で `docker compose up -d` を実行している。

2. **停止 API を読む**

`src/app/api/sites/[id]/stop/route.ts` で `docker compose down` を実行している。

3. **実際の状態の取得を読む**

`src/lib/sites.ts` の `getActualContainerStatus(sitePath)` と `getSitesWithActualStatus()` を読む。  
`docker compose ps --format json` の出力は環境によって次のような違いがあるため、それに合わせた処理をしている。

- **行区切り**: `\r\n`（CRLF）の環境では `split("\n")` だけだと `\r` が残りパースに影響することがある。`split(/\r?\n/)` で `\n` / `\r\n` のどちらでも行に分割し、各行を `trim()`、空行は `filter(Boolean)` で除外する。
- **配列出力**: 環境によっては 1 行が配列 `[...]` になる。パース結果が配列ならその要素を、オブジェクトなら `[parsed]` としてループし、どちらの形式でも wordpress サービスの `State === "running"` を判定する。
- **1行に複数JSONや途中改行**: 長い 1 行の途中に改行が入ると `JSON.parse(line)` が「line 2 column 1」のようなエラーになる。パース失敗時だけ、その行を `\n` で分割し、先頭の 1 行だけを再度 `JSON.parse` して wordpress の State を判定する。

このように環境差を吸収することで、「Error parsing Docker compose output」を避け、ステータスが正しく判定される。

## 確認

- ダッシュボードで「停止」→ 一覧の表示が「停止」に変わる。
- ターミナルで該当サイトのディレクトリに移動し、`docker compose down` したあと、ダッシュボードを再読み込みすると「停止」と表示される。
- 再度「起動」するとコンテナが上がり、表示が「起動中」に変わる。
