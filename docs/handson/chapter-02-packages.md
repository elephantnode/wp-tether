# 第1.5章：追加でインストールするパッケージとその役割

[← ハンズオン目次](README.md)

`npm install` で入る依存関係が「何に使われているか」を押さえておくと、機能追加やトラブル時に役立ちます。

## 本番依存関係（dependencies）

| パッケージ | 役割・なぜ必要か |
|-----------|------------------|
| **next** | Next.js 本体。App Router・API Route・Server/Client Component を提供。 |
| **react**, **react-dom** | UI ライブラリ。Next.js が React 上で動くため必須。 |
| **@hookform/resolvers** | react-hook-form と **Zod** を繋ぐアダプタ。フォームの `resolver={zodResolver(formSchema)}` で「Zod スキーマによるバリデーション」をフォームに渡す。 |
| **react-hook-form** | フォームの state（入力値・エラー・送信状態）を管理。再レンダーを抑えつつ、バリデーションと送信を扱う。 |
| **zod** | スキーマベースのバリデーションと型推論。API の body やフォームの値を「形」で検証し、TypeScript の型にも反映できる。 |
| **yaml** | テンプレート（`templates/*.yml`）の読み込み・パース。PHP/DB バージョンや除外パターンなどをコードに書かず YAML で管理するため。 |
| **lucide-react** | アイコンコンポーネント（Play, Square, Folder など）。統一された見た目で UI を組み立てる。 |
| **qrcode** | QR コード画像生成。トンネルURL をスマホで開くための QR 表示に使用。 |
| **radix-ui** | アクセシブルな UI プリミティブ（ダイアログ・セレクト・ドロップダウンなど）。shadcn/ui の基盤。 |
| **class-variance-authority** (cva) | コンポーネントの「バリアント」（例: size=sm/lg, variant=primary/outline）を型安全に定義。shadcn の Button 等で利用。 |
| **clsx** | 条件に応じたクラス名の結合（`clsx("base", isActive && "active")`）。Tailwind で状態ごとのスタイルを切り替えるときによく使う。 |
| **tailwind-merge** | 同じ Tailwind カテゴリのクラスが重なったときに、後から渡した方を優先してマージ。shadcn の `cn()` の内部で使用。 |

## 開発時依存関係（devDependencies）

| パッケージ | 役割・なぜ必要か |
|-----------|------------------|
| **typescript** | 型チェックと型推論。`Site` や `DeployTarget` などの型で API と画面の契約を明示する。 |
| **@types/node**, **@types/react**, **@types/react-dom**, **@types/qrcode** | Node/React 等の型定義。TypeScript が標準では持っていない型を補う。 |
| **tailwindcss**, **@tailwindcss/postcss**, **tw-animate-css** | Tailwind CSS とアニメーション。shadcn は Tailwind 前提。 |
| **eslint**, **eslint-config-next** | コードの品質・一貫性チェック。Next の推奨ルールが含まれる。 |
| **babel-plugin-react-compiler** | React Compiler（React 19 の最適化）。自動メモ化などでパフォーマンスを補助。 |

## 押さえておくポイント

- **フォーム周り**：`react-hook-form`（状態）＋ `zod`（ルール）＋ `@hookform/resolvers`（つなぎ）で、バリデーションと型を一括で扱っている。
- **UI**：`radix-ui` ＋ `tailwind-merge` ＋ `clsx` ＋ `cva` は shadcn/ui 導入時にまとめて入る。スタイルは Tailwind、挙動と a11y は Radix が担う。
- **データ**：サイト一覧は JSON、テンプレートは YAML。Zod は「API の入力」の検証にも流用できる（例：POST body を Zod で parse する）。
