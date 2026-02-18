# wp-tether

WordPressローカル開発環境管理ツール（Local by Flywheel / MAMP 代替）

Dockerを使用して複数のWordPressサイトを簡単に作成・管理し、リモートサーバーとのファイル・DB同期も可能です。

## ハンズオンで理解する

**手を動かしてプロジェクトの仕組みを理解したい方向け**に、[docs/HANDSON.md](docs/HANDSON.md) にハンズオン形式の手順書を用意しています。

- 開発環境の準備から、データ層・API・画面・Docker 生成まで章ごとに解説
- 各技術の「なぜ必要か」と「何をしているか」を押さえられる
- 既存プロジェクトで確認する手順と、ゼロから再現する場合の目安を記載

## 機能

### サイト管理
- 複数のWordPressローカル環境を作成・管理
- Docker Composeでワンクリック起動/停止
- WordPress / PHP / MySQL / MariaDB のバージョンを自由に選択
- テンプレートで構成を再利用

### ホスト名 & SSL
- カスタムホスト名（`mysite.test`）でアクセス
- mkcert連携でブラウザ警告なしのHTTPS
- Caddyによるリバースプロキシ

### デプロイ・同期
- **ファイル同期**: rsyncでテーマ・プラグイン・アップロードをPush/Pull
- **DB同期**: WP-CLI / mysqldumpでデータベースをPush/Pull（URL自動置換）
- 除外パターンのUI設定
- リモートバックアップ管理

### 外部公開
- cloudflared / ngrok でローカルサイトを一時的に公開
- QRコード表示でスマホ確認が簡単

### その他
- Mailpit統合（メールテスト）
- WP-CLI + rsync/ssh対応コンテナ
- プラグインプリセット（一括インストール）
- 設定のエクスポート/インポート

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Docker Compose

## セットアップ

### 前提条件

- Node.js 20+
- Docker Desktop
- （推奨）mkcert - HTTPS証明書用
- （オプション）cloudflared または ngrok - 外部公開用

### インストール

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

http://localhost:3000 にアクセス

### mkcertのセットアップ（推奨）

```bash
brew install mkcert
mkcert -install   # ローカルCAを信頼リストに追加（初回のみ）
```

## 使い方

### 1. サイト作成

1. サイドバーの「新規サイト作成」をクリック
2. サイト名、ホスト名を入力
3. ホスト名モードを選択:
   - **カスタムホスト名**: `mysite.test` でアクセス（Caddy経由）
   - **localhost**: `localhost:8080` でアクセス
4. テンプレートを選択（詳細設定が自動入力）
5. 「作成」をクリック

### 2. サイト起動

サイトカードの「起動」ボタンをクリック、または:

```bash
cd ~/wp-sites/mysite
docker compose up -d
```

### 3. WordPressにアクセス

- カスタムホスト名モード: `https://mysite.test`
- localhostモード: `http://localhost:8080`

**注意**: カスタムホスト名を使う場合、`/etc/hosts` に追加が必要:
```
127.0.0.1 mysite.test
```

### 4. デプロイ（リモート同期）

1. 「デプロイ」メニューでデプロイターゲットを設定
2. SSH接続情報、リモートのWordPressパス、DB情報を入力
3. 接続テストで確認
4. ファイル同期・DB同期を実行

### 5. 外部公開（トンネル）

サイトカードの「公開」ボタンで一時的なURLを発行:
- cloudflared: `xxx.trycloudflare.com`
- ngrok: `xxx.ngrok-free.app`

## 生成されるファイル

```
~/wp-sites/mysite/
├── docker-compose.yml   # Docker構成
├── .env                 # 環境変数
├── Caddyfile            # Caddy設定（カスタムホスト名モード）
├── certs/               # mkcert証明書
├── php/
│   └── custom.ini       # PHPカスタム設定
├── docker/
│   └── wpcli/           # WP-CLI Dockerfile
└── src/                 # WordPressファイル
```

## Docker構成

| サービス | 説明 | ポート |
|---------|------|--------|
| wordpress | WordPress本体 | port (例: 8080) |
| mariadb / mysql | データベース | 3306 (内部) |
| caddy | リバースプロキシ | 80, 443 |
| mailpit | メールテスト | port+1000 |
| wpcli | WP-CLI + rsync/ssh | - |

## PHP設定

`php/custom.ini` を編集してPHP設定をカスタマイズ:

| 設定 | デフォルト |
|------|-----------|
| memory_limit | 300M |
| max_execution_time | 180 |
| upload_max_filesize | 64M |
| post_max_size | 64M |
| date.timezone | Asia/Tokyo |

編集後: `docker compose restart wordpress`

## Mailpit

メールテスト用のMailpitが含まれています。

- WebUI: `http://localhost:9080`（port+1000）
- SMTP: `mailpit:1025`（コンテナ内）

WordPressでWP Mail SMTPプラグインを設定:
- Host: `mailpit`
- Port: `1025`
- 暗号化: なし

## テンプレート

`templates/` にYAMLファイルを追加して独自テンプレートを作成:

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
```

## ライセンス

MIT
