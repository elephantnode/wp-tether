"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Globe,
  Rocket,
  Share2,
  Mail,
  Terminal,
  Package,
  ChevronDown,
  ExternalLink,
  FolderSync,
  Database,
  ShieldCheck,
} from "lucide-react";

interface HelpSection {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  content: React.ReactNode;
}

const helpSections: HelpSection[] = [
  {
    id: "site-create",
    icon: Globe,
    title: "サイト作成",
    description: "新しいWordPressローカル環境を作成する",
    content: (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-2">
          <li>サイドバーの「新規サイト作成」をクリック</li>
          <li>サイト名を入力（例: mysite）</li>
          <li>ホスト名モードを選択:
            <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
              <li><strong>カスタムホスト名</strong>: <code>mysite.test</code> でアクセス（推奨）</li>
              <li><strong>localhost</strong>: <code>localhost:8080</code> でアクセス</li>
            </ul>
          </li>
          <li>テンプレートを選択（MariaDB / MySQL 8.0 など）</li>
          <li>「作成」をクリック</li>
        </ol>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm">
          <strong>注意:</strong> カスタムホスト名を使う場合、<code>/etc/hosts</code> に追加が必要です:
          <pre className="mt-2 bg-muted p-2 rounded text-xs">127.0.0.1 mysite.test</pre>
        </div>
      </div>
    ),
  },
  {
    id: "site-manage",
    icon: Terminal,
    title: "サイト管理",
    description: "起動・停止・削除・再生成",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">サイトカードのボタン</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>起動</strong>: Docker Composeでコンテナを起動</li>
          <li><strong>停止</strong>: コンテナを停止（データは保持）</li>
          <li><strong>再起動</strong>: コンテナを再起動（コンテナ一覧ページから）</li>
          <li><strong>削除</strong>: サイトを削除（確認ダイアログあり）</li>
          <li><strong>再生成</strong>: docker-compose.ymlなどを再生成</li>
          <li><strong>プラグイン</strong>: プリセットのプラグインを一括インストール（クリック後に確認ダイアログ→「インストール」で実行）</li>
          <li><strong>セキュリティ</strong>: バージョン確認・ファイルスキャン・脆弱性照合（クリック後に確認ダイアログ→「スキャン実行」で実行）</li>
        </ul>
        <h4 className="font-medium mt-4">コマンドラインから</h4>
        <pre className="bg-muted p-3 rounded text-sm">
{`cd ~/wp-sites/mysite
docker compose up -d      # 起動
docker compose down       # 停止
docker compose logs -f    # ログ確認`}
        </pre>
      </div>
    ),
  },
  {
    id: "deploy",
    icon: Rocket,
    title: "デプロイ設定",
    description: "リモートサーバーとの接続設定",
    content: (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-2">
          <li>「デプロイ」メニューを開く</li>
          <li>サイトを選択して「デプロイターゲットを追加」</li>
          <li>SSH接続情報を入力:
            <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
              <li>ホスト、ユーザー名、ポート番号</li>
              <li>SSH鍵のパス（例: <code>~/.ssh/id_rsa</code>）</li>
            </ul>
          </li>
          <li>リモートのWordPressパスを入力</li>
          <li>DB接続情報を入力（DB同期を使う場合）</li>
          <li>「接続テスト」で確認</li>
        </ol>
      </div>
    ),
  },
  {
    id: "file-sync",
    icon: FolderSync,
    title: "ファイル同期",
    description: "rsyncでテーマ・プラグインをPush/Pull",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">同期対象</h4>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>themes（テーマ）</li>
          <li>plugins（プラグイン）</li>
          <li>uploads（メディア）</li>
          <li>mu-plugins（MUプラグイン）</li>
          <li>languages（言語ファイル）</li>
        </ul>
        <h4 className="font-medium mt-4">同期モード</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Push</strong>: ローカル → リモート</li>
          <li><strong>Pull</strong>: リモート → ローカル</li>
        </ul>
        <h4 className="font-medium mt-4">同期タイプ</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>mirror</strong>: 完全同期（削除も同期）</li>
          <li><strong>additive</strong>: 追加のみ（削除しない）</li>
          <li><strong>update</strong>: 更新のみ（新規追加しない）</li>
        </ul>
      </div>
    ),
  },
  {
    id: "db-sync",
    icon: Database,
    title: "DB同期",
    description: "データベースをPush/Pull（URL自動置換）",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">同期の流れ</h4>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>元のDBをダンプ</li>
          <li>先のDBにバックアップを作成</li>
          <li>ダンプをインポート</li>
          <li>URLを自動置換（search-replace）</li>
        </ol>
        <h4 className="font-medium mt-4">オプション</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>ユーザーを除外</strong>: wp_usersとwp_usermetaを同期しない</li>
        </ul>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm mt-4">
          <strong>注意:</strong> DB同期は破壊的な操作です。バックアップは自動作成されますが、重要なデータは事前に手動バックアップを推奨します。
        </div>
      </div>
    ),
  },
  {
    id: "tunnel",
    icon: Share2,
    title: "外部公開（トンネル）",
    description: "cloudflared / ngrok で一時的に公開",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">前提条件</h4>
        <p className="text-muted-foreground">以下のいずれかをインストール:</p>
        <pre className="bg-muted p-3 rounded text-sm">
{`brew install cloudflared   # 推奨（無料・無制限）
brew install ngrok         # 代替`}
        </pre>
        <h4 className="font-medium mt-4">使い方</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>サイトカードの「公開」ボタンをクリック</li>
          <li>公開URLが発行される（例: <code>xxx.trycloudflare.com</code>）</li>
          <li>QRコードでスマホからも確認可能</li>
          <li>「停止」で公開終了</li>
        </ol>
        <p className="text-sm text-muted-foreground mt-4">
          トンネルは一時的なURLで、セッション終了時に無効になります。
        </p>
      </div>
    ),
  },
  {
    id: "mailpit",
    icon: Mail,
    title: "メールテスト（Mailpit）",
    description: "送信メールをローカルで確認",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">Mailpit WebUI</h4>
        <p className="text-muted-foreground">
          <code>http://localhost:9080</code>（ポート番号 + 1000）
        </p>
        <h4 className="font-medium mt-4">WordPress設定</h4>
        <p className="text-muted-foreground mb-2">WP Mail SMTPプラグインで以下を設定:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>SMTP Host: <code>mailpit</code></li>
          <li>SMTP Port: <code>1025</code></li>
          <li>暗号化: なし</li>
          <li>認証: なし</li>
        </ul>
      </div>
    ),
  },
  {
    id: "plugins",
    icon: Package,
    title: "プラグインプリセット",
    description: "新規サイトに一括インストール",
    content: (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-2">
          <li>「設定」→「プラグインプリセット」を開く</li>
          <li>インストールしたいプラグインのスラッグを1行ずつ入力</li>
          <li>「保存」をクリック</li>
          <li>サイトカードの「プラグイン」ボタンをクリック → 確認ダイアログで「インストール」を選ぶと一括インストール</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          既にインストール済みのプラグインはスキップされます。
        </p>
        <h4 className="font-medium mt-4">スラッグの確認方法</h4>
        <p className="text-muted-foreground">
          WordPress公式リポジトリのURLから確認:
        </p>
        <pre className="bg-muted p-2 rounded text-sm mt-2">
          https://wordpress.org/plugins/<strong>contact-form-7</strong>/
        </pre>
      </div>
    ),
  },
  {
    id: "security",
    icon: ShieldCheck,
    title: "セキュリティチェック",
    description: "バージョン確認・ファイルスキャン・既知の脆弱性照合",
    content: (
      <div className="space-y-4">
        <h4 className="font-medium">使い方</h4>
        <ol className="list-decimal list-inside space-y-2">
          <li>サイトカードの「セキュリティ」ボタンをクリック</li>
          <li>確認ダイアログで「スキャン実行」をクリック</li>
          <li>結果モーダルで以下を確認</li>
        </ol>
        <h4 className="font-medium mt-4">表示内容</h4>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li><strong>バージョン</strong>: WordPress・PHP・プラグイン・テーマのバージョン一覧（有効/無効の区別あり）</li>
          <li><strong>ファイルスキャン</strong>: wp-content 配下の PHP と JavaScript を走査。PHP は eval や base64_decode など、JS は eval や document.write、innerHTML 代入など不審なパターンを検出</li>
          <li><strong>依存関係（npm audit）</strong>: package.json があるテーマ・プラグインで npm audit を実行し、深刻度別（critical / high / moderate / low）の件数を表示</li>
          <li><strong>既知の脆弱性（WPVulnerability）</strong>: 外部APIで照合した CVE 等。該当がある場合のみ表示</li>
          <li><strong>推奨事項</strong>: 無効化プラグインの削除推奨、PHP のサポート終了警告、不審なコード・npm 脆弱性の要確認案内</li>
        </ul>
        <h4 className="font-medium mt-4">キャッシュと再スキャン</h4>
        <p className="text-muted-foreground">
          スキャン結果は再スキャンするまで有効です。同じサイトで「セキュリティ」を開くと前回の結果を表示します。最新の結果が必要なときは結果モーダル内の「再スキャン」をクリックして実行してください。
        </p>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm mt-4">
          <strong>注意:</strong> バージョン取得はサイトが稼働中の場合のみ行われます。停止中はファイルスキャンのみ実行され、その旨が表示されます。
        </div>
      </div>
    ),
  },
];

export default function HelpPage() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function openAll() {
    const allOpen: Record<string, boolean> = {};
    helpSections.forEach((s) => (allOpen[s.id] = true));
    setOpenSections(allOpen);
  }

  function closeAll() {
    setOpenSections({});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">使い方</h1>
        <div className="flex gap-2">
          <button
            onClick={openAll}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            すべて開く
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            onClick={closeAll}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            すべて閉じる
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {helpSections.map((section) => (
          <Collapsible
            key={section.id}
            open={openSections[section.id]}
            onOpenChange={() => toggleSection(section.id)}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <section.icon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{section.title}</CardTitle>
                        <CardDescription className="mt-0.5">
                          {section.description}
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform ${
                        openSections[section.id] ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4">{section.content}</CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            詳細ドキュメント
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            詳しい情報はREADME.mdを参照してください。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
