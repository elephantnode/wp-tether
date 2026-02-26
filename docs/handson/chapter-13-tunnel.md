# 第12章：トンネルの仕組み

[← ハンズオン目次](README.md)

## 何をするか

ローカルサイトを一時的にインターネットに公開する **トンネル** 機能の仕組みを理解します。スマートフォンでの表示確認や、外部サービスとの Webhook 連携に使います。

## なぜこの設計か

- **ローカルは外から見えない**：`localhost:8080` は同じマシンからしかアクセスできない。スマホや外部サービスからアクセスするには、一時的なトンネルが必要。
- **複数プロバイダー対応**：cloudflared（Cloudflare Tunnel）と ngrok の両方に対応。インストール済みのツールを自動検出して使う。
- **メモリ内で管理**：トンネルは子プロセスとして起動し、Map で管理。アプリを終了すればトンネルも終了する。

## 主なファイルと役割

| ファイル | 役割 |
|----------|------|
| `src/lib/tunnel.ts` | トンネルの開始・停止・状態管理 |
| `src/app/api/sites/[id]/tunnel/route.ts` | GET/POST/DELETE でトンネルを操作する API |

## 処理の流れ

1. **プロバイダー検出**：`getAvailableProviders()` で cloudflared / ngrok がインストールされているか確認。
2. **トンネル開始**：`startTunnel()` で `spawn()` により子プロセスを起動。
   - cloudflared: `cloudflared tunnel --url http://localhost:8080`
   - ngrok: `ngrok http http://localhost:8080 --log stdout`
3. **公開 URL 取得**：子プロセスの stderr/stdout から URL（`https://xxx.trycloudflare.com` など）を正規表現で抽出。
4. **状態管理**：`activeTunnels` Map にプロセスと情報を保存。
5. **トンネル停止**：`stopTunnel()` でプロセスを kill し、Map から削除。

## ポイント

### 公開 URL の取得タイミング

cloudflared / ngrok はプロセス起動後、数秒で公開 URL を出力する。`startTunnel()` は最大 15 秒待機し、URL が取得できたら `status: "connected"` で返す。

### QR コード

公開 URL をスマホで簡単に開けるよう、`/api/qrcode?url=...` で QR コード画像を生成している。ダイアログに表示されるので、スマホのカメラで読み取れる。

### HTTPS の自己署名証明書

カスタムホスト名モード（`https://mysite.test`）の場合、ローカル証明書は自己署名。cloudflared には `--no-tls-verify` を付けて証明書エラーを無視する。

## 確認

- cloudflared または ngrok をインストールした状態で、サイトカードの「トンネル」をクリック。
- 「cloudflared で開始」などを押すと、数秒後に公開 URL と QR コードが表示される。
- スマホで QR を読み取り、ローカルサイトにアクセスできることを確認。
- 「トンネルを停止」でプロセスが終了し、公開 URL がアクセス不能になる。
