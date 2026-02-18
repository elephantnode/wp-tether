# 第1章：開発環境の準備

[← ハンズオン目次](README.md)

## 何をするか

Node.js・Docker・（任意）mkcert を用意し、このプロジェクトを動かす土台を整えます。

## なぜ必要か

- **Node.js**：Next.js は Node 上で動く。`npm run dev` や `npm run build` は Node が必須。
- **Docker**：WordPress と DB をコンテナで起動するため。Local by Flywheel の代わりに「自分で Compose を管理する」設計なので、Docker が無いとサイトが起動しない。
- **mkcert**：カスタムホスト名（`mysite.test`）で HTTPS を使うときに、ブラウザに「安全」と表示させるためのローカル証明書。無くても Caddy の内部証明で動くが、警告が出る。

## 手順

```bash
# Node.js のバージョン確認（20以上推奨）
node -v

# 未導入なら https://nodejs.org/ または nvm でインストール

# Docker が動いているか確認
docker --version
docker compose version

# （任意）mkcert でローカル HTTPS
brew install mkcert   # macOS
mkcert -install       # 初回のみ。ローカルCAを信頼リストに追加
```

## 確認

- `node -v` で v20.x などが表示される
- `docker compose version` で Compose v2 が表示される
- プロジェクトルートで `npm install` → `npm run dev` し、http://localhost:3000 が開く
