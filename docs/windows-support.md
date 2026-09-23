# wp-tether Windows 対応 調査レポート

作成日: 2026-07-13 / 対象ブランチ: main

現在 wp-tether は macOS 前提で作られている。本レポートは Windows でも動作させるために必要な
変更箇所を洗い出し、対応方針をまとめたもの（実装は未着手・調査のみ）。

## 前提・方針

- コア（Next.js 16 / Docker Compose / WordPress / DB / Mailpit / WP-CLI）は元々クロスプラットフォーム。
  作業の中心は **OS依存の周辺機能（ネイティブダイアログ・通知・hosts書換・外部コマンド起動・rsync）** の差し替え。
- Docker Desktop for Windows は WSL2 バックエンド前提のため、**rsync は WSL2 経由で呼ぶ**方針とする。
- Windows は Windows 10 (1809+) / 11 を想定（OpenSSH クライアント標準搭載）。

## 対応度サマリ

### ✅ そのまま動く（変更ほぼ不要）
| 領域 | 該当 | 備考 |
|---|---|---|
| Docker Compose 一式 | `src/lib/docker-compose.ts` | Docker Desktop for Windows で動作 |
| SSL (Caddy + mkcert) | `docker-compose.ts` / `src/app/api/sites/route.ts` | mkcert/Caddy に Windows 版あり。`execFile("mkcert")` は PATH 通っていれば可 |
| 資格情報暗号化 | `src/lib/secrets.ts:18` (`os.homedir()/.wp-tether`) | クロスプラットフォーム |
| 設定・パス展開 | `src/lib/app-config.ts:56`, `src/lib/sites.ts` | `os.homedir()` + `path.join`。`~/` プレフィックスのみ展開だが実害小 |
| Slack / Google Chat 通知 | `src/lib/notify.ts` | HTTP webhook で OS 非依存 |
| SSH / SCP 実行 | `src/lib/remote-exec.ts`, `src/lib/db-sync.ts`, `src/lib/sync.ts` | Windows 10+ の OpenSSH で `ssh`/`scp` は動く見込み（鍵権限まわり要検証） |

### ⚠️ OS分岐の追加で対応（osascript 依存）
| 機能 | ファイル | 現状 | Windows 対応案 |
|---|---|---|---|
| フォルダピッカー | `src/app/api/pick-folder/route.ts` | mac(osascript)/linux(zenity) のみ | PowerShell `System.Windows.Forms.FolderBrowserDialog` を追加 |
| アプリピッカー | `src/app/api/pick-app/route.ts` | **mac のみ** | PowerShell ダイアログ、または実行ファイルパス手入力にフォールバック |
| ネイティブ通知 | `src/lib/notify.ts:70` `sendMacNotification` | osascript | PowerShell トースト（BurntToast 等）or 省略（Slack/GChatで代替可） |
| hosts 書換 | `src/lib/hosts.ts:99` `applyHosts` | **mac のみ**（`osascript ... with administrator privileges` + `/bin/cp`）| `HOSTS_PATH` は win32 対応済み（`hosts.ts:16`）。書込手段のみ要実装（管理者権限で `C:\Windows\System32\drivers\etc\hosts` へ）|
| フォルダ/エディタ/ターミナルを開く | `open-folder` / `open-editor` / `open-terminal` route | win32 分岐あり | 実装はあるがエディタ・ターミナルが `explorer` 固定で不十分 → `code` / `wt` 等へ改善 |

### 🔴 難所
| 機能 | ファイル | 課題 | 方針 |
|---|---|---|---|
| rsync ファイル同期 | `src/lib/sync.ts` | Windows に rsync 標準搭載なし | **WSL2 経由で rsync を呼ぶ**（Docker Desktop が WSL2 前提のため追加インストール不要）。パス変換（`C:\...` → `/mnt/c/...`）とコマンドラッパが必要 |

## 詳細メモ

### 1. osascript 依存の全箇所
`rg osascript src` の結果は 4 ファイル:
- `src/lib/hosts.ts` — 管理者権限での hosts 書込
- `src/lib/notify.ts` — display notification
- `src/app/api/pick-folder/route.ts` — choose folder
- `src/app/api/pick-app/route.ts` — choose application

いずれも `process.platform` 分岐で Windows 用実装（主に PowerShell）を足す形。

### 2. hosts 書換の権限
- mac は osascript の `with administrator privileges` で GUI パスワードダイアログを出している。
- Windows は UAC 昇格が必要。案:
  - PowerShell を `Start-Process -Verb RunAs` で昇格起動し hosts に追記/差替。
  - もしくは wp-tether 自体を管理者として起動する運用にし、直接書込。
- 管理ブロックのマーカー方式（`buildHostsContent`）はそのまま流用可。

### 3. rsync / WSL2 方針の実装ポイント
- `sync.ts` は現在ホスト上の `rsync -e "ssh ..."` を execFile。
- Windows では `wsl rsync ...` としてラップ。以下が必要:
  - ローカルパスの変換: `C:\Users\x\site` → `/mnt/c/Users/x/site`。
  - SSH 鍵パス（`-e ssh -i <key>`）も WSL 内パスに変換、または WSL 側の鍵を使用。
  - WSL ディストリに rsync/ssh が入っている前提チェック（未導入時のガイド表示）。
- SSH 単体・SCP・DB同期（`remote-exec.ts` / `db-sync.ts`）は Windows ネイティブ OpenSSH で動く見込みのため、rsync だけ WSL 経由という混在構成になる点に注意。

### 4. パス処理
- `~/` 展開は `startsWith("~/")` のみ対応（`app-config.ts` / `sites.ts` / `sync.ts` / `remote-exec.ts` / `secrets.ts`）。
  Windows ネイティブパスは `path.join` 側で吸収されるため大きな問題はないが、UI の入力プレースホルダは OS 別に出し分けると親切。

## 推奨ロードマップ

- **Phase 1（基本動作）**: pick-folder / pick-app / notify / hosts / open-* の Windows 分岐追加。
  → サイト作成・起動・停止・SSL・ローカル操作が Windows で完結。工数目安 0.5〜1日。
- **Phase 2（デプロイ）**: WSL2 経由 rsync ラッパ + パス変換 + 事前チェック。
  → ファイル同期が Windows で利用可能に。難所につき単独で検証したい。

## 未検証事項（実装前に確認したいこと）
- Windows OpenSSH の鍵ファイル権限要件（`Bad permissions` 問題）と回避策。
- mkcert の CA インストールが Windows 証明書ストアで正しく効くか。
- WSL2 の有無・ディストリ検出方法（`wsl -l -q`）と rsync 導入誘導フロー。
