# wp-tether ハンズオンガイド

このドキュメントは、**手を動かして** wp-tether の仕組みを理解するための手順書です。  
AIに任せきりにせず、各技術の「なぜ」と「何をしているか」を押さえられるように、段階ごとに解説します。

---

## このガイドの進め方

- **章ごとに区切って進める**：1章ずつ実行・確認してから次へ。
- **既存プロジェクトで試す場合**：該当章の「手順」だけ別ディレクトリで再現し、本プロジェクトと比較すると理解が深まります。
- **ゼロから再現する場合**：ステップ形式の手順（Step 1 から）を新しいフォルダで実行すると、プロジェクト全体を自分で組み立てた感覚が得られます。
- **パッケージとセキュリティ**：「追加でインストールするパッケージの役割」と「実装で気をつけたいセキュリティ対策」は別ファイルで解説しています。実装やレビュー時の参考にしてください。

---

## ドキュメント一覧

### ゼロから構築する手順（ステップ形式）

[Qiita のチュートリアル](https://qiita.com/Sicut_study/items/fd8e8a9fe05631fc5ca8)のように、**別フォルダでアプリを一から再構築できる**手順です。各ステップの最後で一度止め、動作確認してから次へ進んでください。

| ファイル | 内容 |
|----------|------|
| [step-01-foundation.md](step-01-foundation.md) | **Step 1**：開発環境の準備、Next.js プロジェクト作成、データ置き場と型の定義 |
| [step-02-site-list.md](step-02-site-list.md) | **Step 2**：サイト一覧の取得 API、ダッシュボード画面で一覧表示 |
| [step-03-site-creation.md](step-03-site-creation.md) | **Step 3**：新規サイト作成フォーム、POST API、Docker 用ファイル生成 |
| [step-04-start-stop.md](step-04-start-stop.md) | **Step 4**：起動・停止 API、実際のコンテナ状態の反映 |
| [step-05-templates-and-delete.md](step-05-templates-and-delete.md) | **Step 5**：テンプレート YAML、サイト削除 |
| （Step 6 以降） | 順次、別ファイルで追加します。 |

**全体の道のり**

| ステップ | 対応する主要機能 | やること |
|----------|------------------|----------|
| **Step 1** | 土台 | 開発環境の準備、Next.js プロジェクト作成、データ置き場と型の定義 |
| **Step 2** | サイト管理（一覧） | サイト一覧の取得 API、ダッシュボード画面で一覧表示 |
| **Step 3** | サイト管理（作成） | 新規サイト作成フォーム、POST API、Docker 用ファイル生成 |
| **Step 4** | サイト管理（起動・停止） | 起動・停止 API、実際のコンテナ状態の反映 |
| **Step 5** | テンプレート・削除 | テンプレート YAML、サイト削除 |
| **Step 6** | デプロイ・同期 | デプロイターゲット、ファイル同期（rsync）、DB 同期 |
| **Step 7** | その他 | コンテナ一覧・ログ、トンネル・QR コード、設定のエクスポートなど |

---

### 既存プロジェクトを理解する（章立て解説）

本プロジェクトの「なぜこうなっているか」を、章ごとに読んで理解するためのドキュメントです。

| ファイル | 内容 |
|----------|------|
| [chapter-01-env.md](chapter-01-env.md) | 第1章：開発環境の準備 |
| [chapter-02-packages.md](chapter-02-packages.md) | 第1.5章：追加でインストールするパッケージとその役割 |
| [chapter-03-nextjs.md](chapter-03-nextjs.md) | 第2章：Next.js プロジェクトの雛形を理解する |
| [chapter-04-data-types.md](chapter-04-data-types.md) | 第3章：データの置き場所と型（サイト一覧の「元」） |
| [chapter-05-api-routes.md](chapter-05-api-routes.md) | 第4章：API ルート（サイト一覧を返す） |
| [chapter-06-dashboard.md](chapter-06-dashboard.md) | 第5章：ダッシュボード画面（一覧を表示する） |
| [chapter-07-site-creation.md](chapter-07-site-creation.md) | 第6章：新規サイト作成の流れ（フォーム → API → ファイル生成） |
| [chapter-08-docker-compose.md](chapter-08-docker-compose.md) | 第7章：Docker Compose の中身を理解する |
| [chapter-09-start-stop.md](chapter-09-start-stop.md) | 第8章：起動・停止と「実際の状態」 |
| [chapter-10-templates.md](chapter-10-templates.md) | 第9章：テンプレート（YAML）の読み込み |
| [chapter-11-deploy.md](chapter-11-deploy.md) | 第10章：デプロイ・同期の考え方（ここから先の発展） |
| [security.md](security.md) | 実装で気をつけたいセキュリティ対策 |
| [summary.md](summary.md) | まとめ：データの流れの整理 / 次のステップ |
