# Step 2：サイト一覧の API とダッシュボード表示

[← ハンズオン目次](README.md)

**ゴール**：`GET /api/sites` でサイト一覧を JSON で返す API を用意し、サイドバー付きのグローバルレイアウトを構築して、トップページ（ダッシュボード）でサイト一覧を表示する。まだ「起動・停止」などの操作はなく、**表示だけ**でよい。

## 2-1. サイト一覧を返す API を作る

**何をするか**  
Next.js の API Route で `GET /api/sites` を定義し、`getSites()` の結果を `{ sites: Site[] }` の形で返します。

**なぜ API ルートか**  
- フロントや他の画面から `fetch('/api/sites')` で一覧を取得できる。  
- 今回はトップページは Server Component で `getSites()` を直接呼ぶが、API を用意しておくとクライアント側の更新や Step 4 以降で使い回せる。

**手順**

1. **API 用ディレクトリとファイルを作成**

```bash
mkdir -p src/app/api/sites
```

2. **GET ハンドラを実装**

`src/app/api/sites/route.ts` を新規作成し、次の内容を書きます。

```typescript
import { NextResponse } from "next/server";
import { getSites } from "@/lib/sites";

/**
 * GET /api/sites - サイト一覧を取得
 */
export async function GET() {
  try {
    const sites = await getSites();
    return NextResponse.json({ sites });
  } catch (error) {
    console.error("Failed to get sites:", error);
    return NextResponse.json(
      { error: "Failed to get sites" },
      { status: 500 }
    );
  }
}
```

**確認**

- 開発サーバーを起動した状態で、ブラウザまたは curl で http://localhost:3000/api/sites を開く。  
- `{"sites":[]}` が返れば OK（まだサイトを追加していないので空配列で正常）。

```bash
# 例
curl http://localhost:3000/api/sites
```

---

## 2-2. グローバルレイアウトとナビゲーションを作る

**何をするか**
shadcn/ui の `sidebar` コンポーネントを使ってサイドバーナビゲーションを実装し、`layout.tsx` でアプリ全体に適用します。これにより、すべてのページで共通の「ロゴ＋メニュー」が表示されます。

**なぜ layout.tsx で作るか**
- `src/app/layout.tsx` は Next.js App Router のルートレイアウト。ここに書いた要素は全ページに適用される。
- サイドバーやヘッダーなど「ページをまたいで共通なもの」はレイアウトに置くのが原則。

**手順**

1. **sidebar コンポーネントを追加**

```bash
npx shadcn@latest add sidebar button
```

2. **サイドバーコンポーネントを作成**

`src/components/app-sidebar.tsx` を新規作成します。`"use client"` ディレクティブが必要な点に注意してください（`usePathname()` フックを使うため）。

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Globe, Rocket, Settings, Plus, Container, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "サイト一覧", href: "/",           icon: Globe      },
  { title: "コンテナ",   href: "/containers", icon: Container  },
  { title: "デプロイ",   href: "/deploy",     icon: Rocket     },
  { title: "設定",       href: "/settings",   icon: Settings   },
  { title: "使い方",     href: "/help",       icon: HelpCircle },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Globe className="w-5 h-5" />
          wp-tether
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <Button className="w-full" size="sm" asChild>
          <Link href="/sites/new">
            <Plus className="w-4 h-4 mr-2" />
            新規サイト作成
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
```

**ポイント**
- `isActive={pathname === item.href}` で現在のページに対応するメニュー項目をハイライト
- `コンテナ` `/deploy` `/settings` `/help` は Step 2 時点では未実装のページ。リンクを踏んでも 404 になるが、後の Step で順に実装する
- `新規サイト作成` ボタン（`/sites/new`）は Step 3 で実装する

3. **layout.tsx を書き換える**

`src/app/layout.tsx` を次の内容に置き換えます。

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "wp-tether",
  description: "WordPress Local Environment Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-14 items-center gap-4 border-b px-6">
              <SidebarTrigger />
            </header>
            <main className="flex-1 p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
```

**確認**

- http://localhost:3000 を開く。
- 左にサイドバー（「wp-tether」ロゴ＋メニュー）、右にページコンテンツが並んで表示されれば OK。
- ヘッダー左端の「≡」ボタンでサイドバーの開閉ができることを確認する。

---

## 2-3. ダッシュボードで一覧を表示する

**何をするか**  
トップページ（`src/app/page.tsx`）を、Server Component のまま「サイト一覧」を表示するように書き換えます。`getSites()` を直接呼び、表示用の形に変換してから、各サイトを簡単なカード（枠）で並べます。Step 2 では shadcn を使わず、Tailwind だけで見た目を付けます。

**なぜ Server Component で getSites() を直接呼ぶか**  
- 一覧表示だけなら、クライアントで state を持たずに済む。  
- サーバー側で `getSites()` を一度呼ぶだけで、API を経由しない分シンプルで速い。

**手順**

1. **表示用の最小カードコンポーネントを用意（任意）**

Step 3 で「起動・停止」などを足すときに拡張しやすいよう、1サイト分を表示するコンポーネントを分けておきます。shadcn は使わず、Tailwind のみで枠とテキストを付けます。

`src/components/site-card.tsx` を新規作成します。

```typescript
interface SiteCardProps {
  site: {
    id: string;
    name: string;
    status: string;
    hostname: string;
    path: string;
    port: number;
    wpVersion: string;
    phpVersion: string;
    dbType: string;
  };
}

export function SiteCard({ site }: SiteCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="font-semibold text-gray-900">{site.name}</div>
      <div className="mt-1 text-sm text-gray-500">
        {site.hostname} · ポート {site.port}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span
          className={`inline-flex rounded px-2 py-0.5 font-medium ${
            site.status === "running"
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {site.status === "running" ? "起動中" : "停止"}
        </span>
        <span className="text-gray-400">
          WP {site.wpVersion} · PHP {site.phpVersion} · {site.dbType}
        </span>
      </div>
    </div>
  );
}
```

2. **トップページを書き換える**

`src/app/page.tsx` を、次の内容に置き換えます。

```typescript
import { SiteCard } from "@/components/site-card";
import { getSites } from "@/lib/sites";

export default async function Dashboard() {
  const sites = await getSites();

  const displaySites = sites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    hostname: site.config.hostname,
    path: site.path,
    port: site.config.port,
    wpVersion: site.config.wordpress.version,
    phpVersion: site.config.php.version,
    dbType: `${site.config.database.type === "mysql" ? "MySQL" : "MariaDB"} ${site.config.database.version}`,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">サイト一覧</h1>
        <p className="text-gray-500">管理中のWordPressサイト</p>
      </div>

      {displaySites.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displaySites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-500">
          <p>サイトがありません</p>
          <p className="text-sm">「新規サイト作成」から始めましょう（Step 3 で実装）</p>
        </div>
      )}
    </div>
  );
}
```

**確認**

- http://localhost:3000 を開く。  
- 「サイト一覧」「管理中のWordPressサイト」と「サイトがありません」が表示されれば OK。  
- テスト用に `data/sites.json` を手で編集して 1 件だけサイトを入れた場合、その 1 件がカードで表示されることを確認するとよい（型を満たすオブジェクトが必要。id, name, path, config, status, createdAt, updatedAt など）。

**テスト用のサイト 1 件の例（任意）**

`data/sites.json` を次のようにすると、一覧に 1 枚カードが出ます。

```json
{
  "sites": [
    {
      "id": "test-1",
      "name": "my-first-site",
      "path": "/tmp/wp-sites/my-first-site",
      "config": {
        "projectName": "my-first-site",
        "hostname": "my-first-site.test",
        "hostnameMode": "custom",
        "suffix": "local",
        "timezone": "Asia/Tokyo",
        "port": 8080,
        "wordpress": { "version": "latest", "debug": true },
        "php": { "version": "8.2" },
        "database": {
          "type": "mariadb",
          "version": "10.6",
          "name": "wordpress",
          "user": "wordpress",
          "password": "wordpress",
          "rootPassword": "somewordpress"
        }
      },
      "status": "stopped",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Step 2 のまとめと確認

- [ ] http://localhost:3000/api/sites にアクセスすると `{"sites":[...]}` が返る
- [ ] http://localhost:3000 を開いたとき、左にサイドバー、右にページコンテンツが表示される
- [ ] サイドバーの「≡」ボタンでサイドバーの開閉ができる
- [ ] サイドバーのメニュー項目で現在のページ（サイト一覧）がハイライトされている
- [ ] サイトが 0 件のときは「サイトがありません」、1 件以上あるときはカードが並んで表示される

**ここまでで Step 2 は完了です。**  
次の **Step 3（新規サイト作成フォームと POST API・Docker 用ファイル生成）** に進む前に、上記が問題ないか確認してください。進めてよい場合は「Step 3 に進んで」と伝えてください。
