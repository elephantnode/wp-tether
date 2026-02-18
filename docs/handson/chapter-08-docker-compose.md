# 第7章：Docker Compose の中身を理解する

[← ハンズオン目次](README.md)

## 何をするか

`src/lib/docker-compose.ts` が、**サイト設定（SiteConfig）から YAML 文字列を組み立てている**ことを理解します。

## なぜコードで生成するか

- テンプレート（WordPress 版・PHP 版・DB 種類・ポート・ホスト名モードなど）が多く、手書きの固定 YAML だと組み合わせが爆発する。
- TypeScript で「設定オブジェクト → 文字列」にすると、バリデーション済みの値だけが使われ、ミスを減らせる。

## 手順

1. **generateDockerCompose の引数と分岐を読む**

`src/lib/docker-compose.ts` の `generateDockerCompose(options)` を開く。

- `config.database.type` が `mariadb` か `mysql` かでサービス名・イメージが変わる。
- MySQL のバージョンによって `command`（認証プラグイン）が変わる。
- `config.hostnameMode` が `localhost` か `custom` かで、WordPress のポート公開のしかたと、Caddy サービスを入れるかが変わる。
- WordPress の `WORDPRESS_CONFIG_EXTRA` で、URL を動的に決める PHP コードを埋め込んでいる（リバースプロキシ対応）。

2. **実際に生成されるファイルを見る**

既に作成済みのサイトがあれば、そのサイトの `docker-compose.yml` を開き、上記の「DB 種類」「ホスト名モード」がどう反映されているか対応付けて読む。

## 確認

- テンプレート（例: `templates/default.yml`）の内容が、API で SiteConfig に変換され、その config が `generateDockerCompose` に渡されて YAML になっている、という一連の流れを追える。
