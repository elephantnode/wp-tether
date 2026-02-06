# wp-tether

WordPressローカル環境の管理ツール。Dockerを使用して複数のWordPressサイトを簡単に作成・管理できます。

## 機能

- **サイト管理** - 複数のWordPressローカル環境を作成・管理
- **テンプレート** - よく使う構成をテンプレートとして共有
- **バージョン選択** - WordPress / PHP / MySQL / MariaDB のバージョンを自由に選択
- **Docker連携** - docker-compose.yml を自動生成

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Docker

## セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

http://localhost:3000 にアクセス

## ディレクトリ構成

```
wp-tether/
├── data/                    # ローカルデータ（Git管理外）
│   └── sites.json           # サイト情報
├── templates/               # 環境テンプレート（Git共有）
│   ├── default.yml          # MariaDB + PHP 8.2
│   └── mysql8.yml           # MySQL 8.0 + PHP 8.2
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── docker/tags/ # Dockerバージョン取得API
│   │   │   ├── sites/       # サイト管理API
│   │   │   └── templates/   # テンプレート取得API
│   │   ├── sites/new/       # 新規サイト作成ページ
│   │   └── page.tsx         # ダッシュボード
│   ├── components/
│   │   ├── app-sidebar.tsx  # サイドバー
│   │   └── site-card.tsx    # サイトカード
│   ├── hooks/
│   │   ├── use-docker-versions.ts
│   │   └── use-templates.ts
│   ├── lib/
│   │   ├── docker-compose.ts # docker-compose.yml生成
│   │   ├── docker-registry.ts # Docker Hub API
│   │   └── sites.ts          # サイト管理
│   └── types/
│       └── index.ts          # 型定義
└── ...
```

## サイト作成

1. サイドバーの「新規サイト作成」をクリック
2. サイト名、ホスト名、ローカルパスを入力（ポート番号はオプション）
3. テンプレートを選択（詳細設定が自動入力）
4. 必要に応じて詳細設定をカスタマイズ
5. 「作成」をクリック

**注意**: ポート番号は未指定でも自動生成されます（WordPressサイト識別用）。実際のWordPressへのアクセスはポート番号不要で `http://mysite.test` または `https://mysite.test` で可能です。

### 生成されるファイル

```
~/wp-sites/my-blog/
├── docker-compose.yml   # Docker構成
├── .env                 # 環境変数
├── Caddyfile            # Caddy設定
├── certs/               # mkcert証明書（使用時）
├── php/
│   └── custom.ini       # PHPカスタム設定（起動時に読み込み）
└── src/                 # WordPressファイル
```

### docker-compose.yml の構成

| サービス | 説明 |
|---------|------|
| mariadb / mysql | データベース |
| wordpress | WordPress本体 |
| caddy | リバースプロキシ（標準ポート80/443でホスト名ベースルーティング） |
| mailpit | メールテスト用（WebUI: port+1000, SMTP: port+2000） |

## サイトの起動

```bash
cd ~/wp-sites/my-blog
docker compose up -d
```

`http://my-blog.test` でWordPressにアクセス（`/etc/hosts`にホスト名を追加する必要があります）

## PHP設定（php.ini）

各サイトの `php/custom.ini` が起動時にコンテナ内の `/usr/local/etc/php/conf.d/zzz-custom.ini` として読み込まれます。メモリ・実行時間・タイムゾーン・文字コードなどをカスタマイズできます。

- **memory_limit**: デフォルト 256M
- **max_execution_time**: デフォルト 180
- **upload_max_filesize** / **post_max_size**: デフォルト 64M
- **date.timezone**: サイトのタイムゾーン（デフォルト Asia/Tokyo）
- **ロケール**: コンテナの `LANG` / `LC_ALL` に `ja_JP.UTF-8` を設定（日本語環境）

編集後は `docker compose restart wordpress` で反映されます。

## テンプレート

`templates/` ディレクトリにYAMLファイルを追加することで、独自のテンプレートを作成できます。

```yaml
# templates/custom.yml
name: "カスタム構成"
description: "説明文"

wordpress:
  version: "6.5"
  debug: true

php:
  version: "8.2"

database:
  type: "mariadb"
  version: "10.6"
  name: "wordpress"
  user: "wordpress"
  password: "wordpress"
  rootPassword: "somewordpress"

exclude:
  - ".git/"
  - "node_modules/"
```

## アクセス方法

### カスタムホスト名でアクセス（推奨）

ポート番号なしでアクセスできます：

1. `/etc/hosts` に追加:
   ```
   127.0.0.1 my-blog.test
   ```
2. ブラウザでアクセス:
   - HTTP: `http://my-blog.test`
   - HTTPS: `https://my-blog.test`

WordPressの設定で、サイトURLを `http://my-blog.test` または `https://my-blog.test` に設定してください。

### SSL証明書（ブラウザの警告を出さないようにする）

HTTPSでは、**mkcert** を使うとブラウザに「安全でない」と出ずに接続できます。

- **mkcert をインストールしている場合**: サイト作成時に自動で証明書が発行され、Caddy がその証明書を利用します。`https://my-blog.test` でそのまま開けます。
- **mkcert を入れていない場合**: Caddy の内部証明書（`tls internal`）が使われ、初回はブラウザで「詳細設定」→「続行」が必要です。

mkcert のインストール（Mac）:

```bash
brew install mkcert
mkcert -install   # ローカルCAを信頼リストに追加（初回のみ）
```

既に作成済みのサイトで後から mkcert を使う場合:

```bash
cd ~/wp-sites/my-blog/certs
mkcert -cert-file cert.pem -key-file key.pem my-blog.test localhost 127.0.0.1
```

その後、Caddyfile の `tls internal` を `tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem` に書き換え、`docker compose restart caddy` で再起動してください。

### ポート構成

| サービス | ポート | 説明 |
|---------|--------|------|
| Caddy HTTP | 80 | 標準HTTPポート（全サイト共通） |
| Caddy HTTPS | 443 | 標準HTTPSポート（全サイト共通） |
| WordPress識別用 | port (例: 8080) | サイト識別用（実際のアクセスはポート番号不要） |
| Mailpit WebUI | port+1000 (例: 9080) | http://localhost:9080 |
| Mailpit SMTP | 1025 | コンテナ内からのみ |

**注意**: 複数のサイトを管理する場合、各サイトは異なるホスト名を使用してください（例: `site1.test`, `site2.test`）。Caddyがホスト名に基づいて適切なWordPressコンテナにルーティングします。

## Mailpit

メールテスト用にMailpitが含まれています。

WordPressからメールを送信するには、WP Mail SMTPプラグインで以下を設定：

- SMTP Host: `mailpit`
- SMTP Port: `1025`
- 暗号化: なし
- 認証: なし

## 今後の予定

- [ ] Docker起動/停止機能
- [ ] デプロイ機能（Wordmove代替）
- [ ] 外部公開（ngrok/Cloudflare Tunnel）
- [ ] サイト削除機能

## ライセンス

MIT
