# 第3章：データの置き場所と型（サイト一覧の「元」）

[← ハンズオン目次](README.md)

## 何をするか

「サイト一覧」の元データが **JSON ファイル** にあり、その形が **TypeScript の型** で定義されていることを理解します。

## なぜ JSON ファイルか

- このツールは「ローカルで複数サイトを管理する」用途。DB サーバーを立てずに済むよう、`data/sites.json` にサイト情報を保存している。
- 編集やバックアップが容易。Git で履歴を追える。
- 本格的な多ユーザー・本番運用にするなら、のちに DB（PostgreSQL など）に差し替える設計にしやすい。

## 手順

1. **データファイルの場所を確認**

```bash
mkdir -p data
cat data/sites.json
# まだ無ければ [] や {"sites":[]} でよい
```

2. **型定義を開く**

`src/types/index.ts` を開き、`Site` と `SiteConfig` を見ます。

- **Site**：id, name, path, config, status, createdAt, updatedAt  
  → 「1サイト分のメタ情報」
- **SiteConfig**：projectName, hostname, hostnameMode, port, wordpress, php, database  
  → 「そのサイトの WordPress まわりの設定」

3. **読み書きしているコードを追う**

`src/lib/sites.ts` を開きます。

- `getSites()`：`data/sites.json` を読んで `sites` 配列を返す。
- `saveSites(sites)`：`data/sites.json` に `{ "sites": sites }` を書き込む。
- `addSite(site)`：getSites() → 配列に push → saveSites()。

ここまでで「一覧の元は JSON」「型は types/index.ts」「読み書きは lib/sites.ts」という流れがつかめます。

## 確認

- `data/sites.json` を手で編集して `"sites": [{ "id": "test", "name": "test-site", ... }]` のような形にし、後述の API や画面で一覧に出るか試す（型を満たす最小限のオブジェクトでよい）。
