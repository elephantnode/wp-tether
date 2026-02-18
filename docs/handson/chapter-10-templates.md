# 第9章：テンプレート（YAML）の読み込み

[← ハンズオン目次](README.md)

## 何をするか

「新規サイト作成」で選ぶ **テンプレート** が、`templates/*.yml` から読み込まれ、フォームの初期値や API に渡るバージョン情報になっている流れを追います。

## なぜ YAML か

- 人間が編集しやすい。PHP や DB のバージョン、デフォルトの除外パターンなどを、コードを触らずに変えられる。
- テンプレートを増やすときも、YAML を1ファイル追加するだけでよい。

## 手順

1. **テンプレート API を読む**

`src/app/api/templates/route.ts` を開く。  
`templates/` ディレクトリを読み、各 YAML をパースして `{ id, name, description, wordpress, php, database, exclude }` のような形で返している。

2. **フォームでの利用を確認**

`src/app/sites/new/page.tsx` で `useTemplates()` を使い、テンプレート選択に応じて `wpVersion`, `phpVersion`, `dbType`, `dbVersion` などをフォームに反映している部分を探す。

**補足（選択が消える問題の回避）**  
テンプレート変更時に `form.reset()` を使うと、フォーム全体がリセットされて **template の選択が戻る**ことがある。  \n+その場合は `setValue()` で必要な項目だけ更新する（`wpVersion` / `phpVersion` / `dbType` / `dbVersion` など）。  \n+また、`<select {...form.register("template")} onChange={...} />` のように `onChange` を上書きすると、React Hook Form の `onChange` が潰れて選択状態が保持されないことがあるため、`templateRegister.onChange(e)` を呼んだあとに独自処理を行う。

3. **YAML の例を見る**

`templates/default.yml` と `templates/mysql8.yml` を開き、どのキーが API やフォームで使われているか対応付ける。

## 確認

- 新規サイト作成画面でテンプレートを切り替えると、バージョンや DB 種類の選択肢や初期値が変わる。
- 自分で `templates/custom.yml` を追加し、一覧に表示され、選択できるか試す。
