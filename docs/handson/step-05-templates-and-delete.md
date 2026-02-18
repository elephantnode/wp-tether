# Step 5：テンプレート YAML とサイト削除

[← ハンズオン目次](README.md)

**ゴール**：**テンプレート**を `templates/*.yml` から読み込み、新規サイト作成フォームの「テンプレート選択」で WP/PHP/DB のバージョンなどを自動反映する。あわせて **サイト削除**（`DELETE /api/sites/[id]`）と、サイトカードからの削除ボタン・確認ダイアログ（オプションで「ディレクトリ削除」「ボリューム削除」）を実装する。

---

## 5-1. テンプレート用 YAML を用意する

**何をするか**  
`templates/` ディレクトリに YAML ファイルを置き、WordPress / PHP / DB のバージョンやデフォルト値を「テンプレート」として定義する。コードを触らずに構成を増やしたり変えたりできるようにする。

**なぜ YAML か**  
- 人間が編集しやすい。PHP や DB のバージョン、デフォルトの除外パターンなどを、コードを触らずに変えられる。  
- テンプレートを増やすときも、YAML を 1 ファイル追加するだけでよい。

**手順**

1. **YAML パッケージをインストール**

```bash
npm install yaml
```

2. **テンプレート用ディレクトリとファイルを作成**

```bash
mkdir -p templates
```

3. **デフォルトテンプレートを 1 つ作成**

`templates/default.yml` を新規作成し、次の内容を書く。

```yaml
name: "Default WordPress"
description: "MariaDB + PHP 8.3 の標準構成"

wordpress:
  version: "latest"
  debug: true

php:
  version: "8.3"

database:
  type: "mariadb"
  version: "10.6"
  name: "wordpress"
  user: "wordpress"
  password: "wordpress"
  rootPassword: "somewordpress"

exclude:
  - ".git/"
  - ".env"
  - "node_modules/"
  - ".DS_Store"
```

**確認**  
- `templates/default.yml` が存在する。  
- （任意）`templates/mysql8.yml` など別テンプレートを追加し、`database.type: "mysql"` と `database.version: "8.0"` などにすると、のちの API で一覧に増えて選べる。

---

## 5-2. テンプレート取得 API を作る

**何をするか**  
`GET /api/templates` で、`templates/` 内の `.yml` / `.yaml` を読み、パースして `{ templates: TemplateConfig[] }` の形で返す。

**手順**

1. **API 用ディレクトリとファイルを作成**

```bash
mkdir -p src/app/api/templates
```

2. **GET ハンドラを実装**

`src/app/api/templates/route.ts` を新規作成し、次の内容を書く。型 `TemplateConfig` は API 内で定義するか、`@/types` に合わせてよい。

```typescript
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import YAML from "yaml";

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  wordpress: {
    version: string;
    debug: boolean;
  };
  php: {
    version: string;
  };
  database: {
    type: "mariadb" | "mysql";
    version: string;
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
  exclude: string[];
}

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

export async function GET() {
  try {
    const files = await fs.readdir(TEMPLATES_DIR);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    const templates: TemplateConfig[] = await Promise.all(
      yamlFiles.map(async (file) => {
        const content = await fs.readFile(
          path.join(TEMPLATES_DIR, file),
          "utf-8"
        );
        const parsed = YAML.parse(content);
        const id = file.replace(/\.(yml|yaml)$/, "");
        return {
          id,
          ...parsed,
        };
      })
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to load templates:", error);
    return NextResponse.json(
      { error: "Failed to load templates" },
      { status: 500 }
    );
  }
}
```

**確認**  
- `npm run build` が通る。  
- 開発サーバー起動中に http://localhost:3000/api/templates を開き、`{ "templates": [ { "id": "default", "name": "Default WordPress", ... } ] }` が返る。

---

## 5-3. useTemplates フックを作る

**何をするか**  
新規サイト作成フォームから `fetch("/api/templates")` でテンプレート一覧を取得し、選択されたテンプレートの内容を `getTemplate(id)` で取り出せるようにする。フォームは「テンプレート」選択に応じて WP/PHP/DB の値を書き換える。

**手順**

1. **フック用ファイルを作成**

```bash
mkdir -p src/hooks
```

2. **useTemplates を実装**

`src/hooks/use-templates.ts` を新規作成し、次の内容を書く。API の型と揃える。

```typescript
"use client";

import { useState, useEffect } from "react";

export interface Template {
  id: string;
  name: string;
  description: string;
  wordpress: {
    version: string;
    debug: boolean;
  };
  php: {
    version: string;
  };
  database: {
    type: "mariadb" | "mysql";
    version: string;
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
  exclude: string[];
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "default",
    name: "Default WordPress",
    description: "MariaDB + PHP 8.2 の標準構成",
    wordpress: { version: "latest", debug: true },
    php: { version: "8.2" },
    database: {
      type: "mariadb",
      version: "10.6",
      name: "wordpress",
      user: "wordpress",
      password: "wordpress",
      rootPassword: "somewordpress",
    },
    exclude: [],
  },
];

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) throw new Error("Failed to fetch templates");
        const data = await res.json();
        setTemplates(data.templates);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const getTemplate = (id: string): Template | undefined => {
    return templates.find((t) => t.id === id);
  };

  return { templates, isLoading, error, getTemplate };
}
```

**確認**  
- `npm run build` が通る。  
- フォーム側で `useTemplates()` を呼び、`templates` の長さが 1 以上（API から取得できている）になることを確認できる。

---

## 5-4. 新規サイト作成フォームでテンプレートを反映する

**何をするか**  
新規サイト作成ページ（`/sites/new`）で、テンプレートを選択するセレクトを表示し、**選択が変わったときに** `getTemplate(id)` で取得した値でフォームの `wpVersion` / `phpVersion` / `dbType` / `dbVersion` を更新する。

**手順**

`src/app/sites/new/page.tsx` を開き、次のように変更する。

0. **`template` をフォーム定義に追加しておく（重要）**

Zod スキーマと `defaultValues` に `template` が無いと、選択状態が保持されず「選ぶと消える」挙動になりやすい。

- Zod（例）

```typescript
template: z.string().min(1, "テンプレートを選択してください"),
```

- defaultValues（例）

```typescript
template: "default",
```

1. **useTemplates を import して使う**

```typescript
import { useTemplates } from "@/hooks/use-templates";

// コンポーネント内
const { templates, isLoading: isLoadingTemplates, getTemplate } = useTemplates();
```

2. **テンプレート選択時にフォームを更新するハンドラを追加（reset ではなく setValue）**

テンプレート変更で `form.reset()` を使うと、フォーム全体がリセットされて **template の選択自体が戻る**ことがある。ここでは **必要な項目だけ**を `setValue()` で更新する。

```typescript
function handleTemplateChange(templateId: string) {
  const template = getTemplate(templateId);
  if (template) {
    form.setValue("wpVersion", template.wordpress.version, { shouldValidate: false });
    form.setValue("phpVersion", template.php.version, { shouldValidate: false });
    form.setValue("dbType", template.database.type, { shouldValidate: false });
    form.setValue("dbVersion", template.database.version, { shouldValidate: false });
  }
}
```

3. **フォームに「テンプレート」のセレクトを追加（register の onChange を潰さない）**

既存のフォーム項目の前（例：サイト名の前）に、次のようなブロックを追加する。  \n+`form.register("template")` が返す `onChange` をそのまま使わないと、React Hook Form 側の状態更新が走らず、選択が保持されないことがある。  \n+そのため、`templateRegister.onChange(e)` を先に呼んでから `handleTemplateChange()` を呼ぶ。

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700">テンプレート</label>
  {(() => {
    const templateRegister = form.register("template");
    return (
      <select
        {...templateRegister}
        onChange={(e) => {
          templateRegister.onChange(e);
          handleTemplateChange(e.target.value);
        }}
        className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
      >
    {templates.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name} — {t.description}
      </option>
    ))}
      </select>
    );
  })()}
</div>
```

4. **ローディング中はフォーム送信を無効にする（任意）**

`isLoadingTemplates` が true のあいだは「作成」ボタンを `disabled` にするとよい。

**確認**  
- `/sites/new` を開き、テンプレートを切り替えると、WP 版・PHP 版・DB 種類・DB 版がフォームに反映される。  
- `templates/mysql8.yml` などを追加した場合、一覧に表示され、選択すると DB が MySQL に変わる。

---

## 5-5. サイト削除 API を作る

**何をするか**  
`DELETE /api/sites/[id]` で、指定した id のサイトを `data/sites.json` から削除する。オプションで **コンテナの停止**（`docker compose down`）、**ディレクトリの削除**（`deleteFiles: true` で `site.path` を `fs.rm`）、**ボリュームの削除**（`deleteVolumes: true` で `docker compose down -v`）を受け付ける。  
**重要**：ディレクトリ削除の前に「削除してよいパスか」を検証し、システムパス・プロジェクト本体・他サイト設定（`data/`）などを誤って消さないようにする。

**手順**

1. **ルートファイルの場所**

Step 3 で `src/app/api/sites/[id]/route.ts` は作っていない想定なので、ここで **DELETE だけ** 実装する。既に `[id]` は start/stop で使っているので、`src/app/api/sites/[id]/route.ts` を新規作成する。

```bash
# [id] ディレクトリは既にある
touch src/app/api/sites/[id]/route.ts
```

2. **DELETE ハンドラを実装**

`src/app/api/sites/[id]/route.ts` に次の内容を書く。body は `{ deleteFiles?: boolean; deleteVolumes?: boolean }` とする。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getSite, deleteSite } from "@/lib/sites";

const execFileAsync = promisify(execFile);

/** 削除してよいサイトディレクトリか検証（システムパス・プロジェクト・data を誤削除しないため） */
async function isSafeToDeleteSitePath(sitePath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = path.normalize(sitePath);
  const projectRoot = process.cwd();
  const dataDir = path.join(projectRoot, "data");
  const home = os.homedir();
  const forbidden = ["/", "/.", "/usr", "/etc", "/var", "/System", "/bin", "/sbin", "/opt", projectRoot, dataDir];
  const resolved = path.resolve(normalized);
  for (const p of forbidden) {
    const r = path.resolve(p);
    if (resolved === r || resolved.startsWith(r + path.sep)) {
      return { ok: false, error: "このパスは削除できません（システムまたはプロジェクトの重要パスです）" };
    }
  }
  if (!resolved.startsWith(home)) {
    return { ok: false, error: "削除できるのはホームディレクトリ以下のサイトのみです" };
  }
  try {
    await fs.access(path.join(resolved, "docker-compose.yml"));
  } catch {
    return { ok: false, error: "サイトディレクトリに docker-compose.yml がありません。誤ったパスを指定していないか確認してください" };
  }
  return { ok: true };
}

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/sites/[id] - サイトを削除
 * body: { deleteFiles?: boolean, deleteVolumes?: boolean }
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const deleteFiles = body.deleteFiles === true;
    const deleteVolumes = body.deleteVolumes === true;

    const site = await getSite(id);
    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // コンテナを停止（ボリューム削除する場合は -v）
    try {
      const args = deleteVolumes
        ? ["compose", "down", "-v"]
        : ["compose", "down"];
      await execFileAsync("docker", args, { cwd: site.path });
    } catch {
      // コンテナが無い場合は無視
    }

    if (deleteFiles) {
      const safe = await isSafeToDeleteSitePath(site.path);
      if (!safe.ok) {
        return NextResponse.json({ error: safe.error }, { status: 400 });
      }
      await fs.rm(site.path, { recursive: true, force: true });
    }

    await deleteSite(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました" },
      { status: 500 }
    );
  }
}
```

**補足（削除パスの検証）**  
`deleteFiles: true` のとき、**ディレクトリを消す前に** `isSafeToDeleteSitePath(site.path)` で次を確認する。

- **禁止パス**：`/`、`/usr`、`/etc`、`/var`、`/System`、プロジェクトルート（`process.cwd()`）、`data/` などと一致またはその配下でないこと。
- **ホーム以下に限定**：実パスが `os.homedir()` 以下であること（システム領域を消さない）。
- **サイトディレクトリであること**：その中に `docker-compose.yml` が存在すること（本ツールで作ったサイトだけ削除対象にする）。

いずれかに引っかかった場合は 400 で `error` メッセージを返し、`fs.rm` は実行しない。これで誤って重要なシステムパスや他サイト設定（`data/sites.json` がある `data/`）を消すのを防ぐ。

**補足（exec と execFile）**  
`exec` はシェル経由のため危険になり得る。ここでは `execFile("docker", ["compose", "down"], { cwd })` を使う。

**確認**  
- `npm run build` が通る。  
- （次の 5-6 で削除ボタンを足したあと）削除を実行すると、一覧からサイトが消え、`deleteFiles: true` の場合はディレクトリも消えている。

**補足**  
本プロジェクト（wp-tether）の実装では、`deleteVolumes` 時に `docker compose down -v` が失敗した場合のフォールバック（`docker compose config --volumes` でボリューム名を取得して個別に `docker volume rm`）も行っている。必要に応じて `src/app/api/sites/[id]/route.ts` を参照できる。

---

## 5-6. サイトカードに削除ボタンを追加する

**何をするか**  
サイトカードに「削除」ボタンを置き、クリックで確認ダイアログを表示する。オプションで「ディレクトリも削除する」「ボリュームも削除する」チェックボックスを付け、確定時に `DELETE /api/sites/[id]` に `{ deleteFiles, deleteVolumes }` を body で送り、成功したら `router.refresh()` で一覧を更新する。

**手順**

`src/components/site-card.tsx` を開き、次のように変更する。

1. **state を追加**

```typescript
const [isDeleting, setIsDeleting] = useState(false);
const [deleteFiles, setDeleteFiles] = useState(false);
const [deleteVolumes, setDeleteVolumes] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

2. **削除ハンドラを追加**

```typescript
async function handleDelete() {
  setIsDeleting(true);
  setError(null);
  try {
    const res = await fetch(`/api/sites/${site.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteFiles, deleteVolumes }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "削除に失敗しました");
    }
    setShowDeleteConfirm(false);
    router.refresh();
  } catch (err) {
    setError(err instanceof Error ? err.message : "エラーが発生しました");
  } finally {
    setIsDeleting(false);
  }
}
```

3. **削除ボタンと確認ダイアログの UI を追加**

カードのフッター（`CardFooter` や起動・停止ボタンがあるブロック）内に「削除」ボタンを置く。クリックで確認用のダイアログを開き、確定時に `handleDelete()` を呼ぶ。

**配置の目安**  
起動中なら「停止」ボタンの隣、停止中なら「起動」ボタンの隣に削除ボタンを並べる。

**削除ボタン（1つ）**

```tsx
<button
  type="button"
  onClick={() => setShowDeleteConfirm(true)}
  disabled={isDeleting}
  className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
>
  {isDeleting ? "削除中…" : "削除"}
</button>
```

**確認ダイアログ（モーダル）**

`showDeleteConfirm` が true のときだけ表示するオーバーレイ＋パネル。中にチェックボックス 2 つと「キャンセル」「削除する」ボタンを置く。

```tsx
{showDeleteConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4 space-y-4">
      <h3 className="font-semibold text-lg">サイトを削除しますか？</h3>
      <p className="text-sm text-gray-600">
        「{site.name}」を一覧から削除します。この操作は取り消せません。
      </p>
      <p className="text-xs text-gray-500">
        削除対象のパス: <code className="bg-gray-100 px-1 rounded break-all">{site.path}</code>
      </p>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={deleteVolumes}
          onChange={(e) => setDeleteVolumes(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          Docker ボリュームも削除する（DB などが消え、次回作成時に新規 DB になります）
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={deleteFiles}
          onChange={(e) => setDeleteFiles(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          サイトのディレクトリも削除する（上記パス以下を削除。ホーム以下で docker-compose.yml があるサイトのみ対象です）
        </span>
      </label>
      {deleteFiles && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          注意: システムの重要パスやプロジェクトの data フォルダは削除されません。該当する場合は API がエラーを返します。
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(false)}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isDeleting ? "削除中…" : "削除する"}
        </button>
      </div>
    </div>
  </div>
)}
```

- チェック「Docker ボリュームも削除する」→ `deleteVolumes`
- チェック「サイトのディレクトリも削除する」→ `deleteFiles`

`handleDelete` 内で成功時に `setShowDeleteConfirm(false)` を呼んでおくと、削除後にダイアログが閉じる。

**shadcn/ui を使う場合**  
`AlertDialog`（`AlertDialogTrigger` / `AlertDialogContent` / `AlertDialogFooter`）と `Checkbox` で同じ構成にすると、見た目を他ボタンと揃えられる。本プロジェクトの `src/components/site-card.tsx` を参照できる。

**確認**  
- 一覧で「削除」を押すと確認が表示され、「削除する」でサイトが一覧から消える。  
- 「ディレクトリも削除」にチェックして削除すると、該当フォルダが存在しなくなる（API がパス検証を通した場合のみ）。  
- 「ボリュームも削除」にチェックすると、次回同じサイト名で作成したときに DB が空の状態からになる。  
- 誤ってシステムパスや `data/` などが指定されているサイトでは、ディレクトリ削除を要求すると API が 400 でエラーを返す。そのメッセージを UI（`error` state）で表示するとよい。

---

## Step 5 のまとめと確認

- [ ] `templates/` に YAML があり、`GET /api/templates` で `{ templates }` が返る
- [ ] `useTemplates()` でテンプレート一覧と `getTemplate(id)` が使える
- [ ] 新規サイト作成フォームでテンプレートを選ぶと、WP/PHP/DB の値がフォームに反映される
- [ ] `DELETE /api/sites/[id]` でサイトが削除され、`deleteFiles` / `deleteVolumes` が効く
- [ ] サイトカードに削除ボタンと確認ダイアログがあり、オプションでディレクトリ・ボリューム削除を選べる

**ここまでで Step 5 は完了です。**  
次は **Step 6（デプロイ・同期）** に進みます。Step 6 のドキュメントは別ファイルで追加予定です。
