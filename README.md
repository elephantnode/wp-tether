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
2. サイト名、ローカルパス、ポート番号を入力
3. テンプレートを選択（詳細設定が自動入力）
4. 必要に応じて詳細設定をカスタマイズ
5. 「作成」をクリック

### 生成されるファイル

```
~/wp-sites/my-blog/
├── docker-compose.yml   # Docker構成
├── .env                 # 環境変数
└── src/                 # WordPressファイル
```

### docker-compose.yml の構成

| サービス | 説明 |
|---------|------|
| mariadb / mysql | データベース |
| wordpress | WordPress本体 |
| mailpit | メールテスト用（WebUI: port+1000, SMTP: port+2000） |

## サイトの起動

```bash
cd ~/wp-sites/my-blog
docker compose up -d
```

http://localhost:8080 でWordPressにアクセス

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

## Mailpit

メールテスト用にMailpitが含まれています。

| 項目 | URL |
|------|-----|
| WebUI | http://localhost:{port+1000} |
| SMTP | localhost:{port+2000} |

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
