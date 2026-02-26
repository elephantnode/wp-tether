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

## Caddy によるリバースプロキシと HTTPS

### Caddy とは

Caddy は Go 製の Web サーバー兼リバースプロキシで、**自動 HTTPS** が特徴です。wp-tether では **カスタムホスト名モード**（`mysite.test` など）のときだけ Caddy コンテナを追加し、以下を実現します。

- ポート番号なしでアクセスできる（80/443 を使う）
- HTTPS が自動で有効になる（mkcert または Caddy 自己署名）
- WordPress コンテナへのリクエストを転送（リバースプロキシ）

`localhost` モードでは Caddy は使わず、WordPress のポートを直接公開します（`8080:80` など）。

### docker-compose.yml での Caddy サービス

`generateDockerCompose()` は `hostnameMode === "custom"` のときだけ `caddy` サービスを追加します。

```yaml
caddy:
  container_name: ${PROJECT_NAME}_caddy
  image: caddy:2-alpine
  restart: always
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - ./certs:/etc/caddy/certs:ro  # mkcert 証明書（あれば）
    - caddy_data:/data
    - caddy_config:/config
  depends_on:
    - wordpress
  networks:
    - wp
```

- `./Caddyfile` がルーティング設定
- `./certs` に mkcert で発行した証明書（`cert.pem` / `key.pem`）を置く
- `caddy_data` / `caddy_config` は Caddy が内部で使うボリューム（証明書キャッシュなど）

### Caddyfile の中身

`generateCaddyfile()` が生成するファイル。mkcert 証明書が使える場合：

```
{
  local_certs
}

# mysite.test - ポート番号なしでアクセス可能（HTTP/HTTPS自動対応）
mysite.test {
  tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
  reverse_proxy wordpress:80 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
```

mkcert がなければ `tls internal`（Caddy 自身の自己署名証明書）を使います。

- `reverse_proxy wordpress:80` で WordPress コンテナへ転送
- `header_up X-Forwarded-Proto {scheme}` で HTTPS / HTTP を WordPress 側に伝える
- `header_up X-Forwarded-Host {host}` でホスト名を転送する

### mkcert との連携

mkcert はローカル CA を使って**ブラウザが信頼する証明書**を発行できるツールです。サイト作成 API では以下の順で処理します。

1. `certs/` ディレクトリを作成
2. `mkcert -cert-file cert.pem -key-file key.pem mysite.test localhost 127.0.0.1` を実行
3. 成功 → `useMkcert: true` で Caddyfile を生成（証明書を参照）
4. 失敗（未インストールなど）→ `tls internal` にフォールバック

### WORDPRESS_CONFIG_EXTRA の役割

WordPress は `WP_HOME` / `WP_SITEURL` でサイト URL を決めます。Caddy 経由では URL がずれるため、`WORDPRESS_CONFIG_EXTRA` 環境変数に PHP コードを埋め込んで動的に決定しています。

| モード | 参照するヘッダー | 結果の URL |
|--------|-----------------|-----------|
| localhost | `HTTP_HOST`（そのまま） | `http://localhost:8080` |
| custom | `HTTP_X_FORWARDED_HOST`（Caddy が付与） | `https://mysite.test` |

カスタムモードではポート番号を `preg_replace('/:\d+$/', '', $host)` で除去しています。これにより管理画面・フロントともに正しい URL で動作します。

## 確認

- テンプレート（例: `templates/default.yml`）の内容が、API で SiteConfig に変換され、その config が `generateDockerCompose` に渡されて YAML になっている、という一連の流れを追える。
- `hostnameMode` が `custom` のとき、生成された `docker-compose.yml` に `caddy` サービスが含まれていること。
- `Caddyfile` の `reverse_proxy wordpress:80` と `header_up X-Forwarded-*` の役割を説明できること。
