#!/usr/bin/env python3
"""
wp-tether handson docs → Notion 同期スクリプト
- docs/handson/ の全 .md ファイルを wp-tether-handson ページの子ページとして同期
- 既存ページは一度 archive してから再作成（上書き同期）
"""

import json
import os
import re
import time
import urllib.request
import urllib.error

NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
PARENT_PAGE_ID = "30c3e61b-10e4-8029-bb3a-d136cb2810fa"
HANDSON_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "handson")

# Notion がサポートするコードブロックの言語
NOTION_LANGUAGES = {
    "abap", "arduino", "bash", "basic", "c", "clojure", "coffeescript",
    "c++", "c#", "css", "dart", "diff", "docker", "elixir", "elm",
    "erlang", "flow", "fortran", "f#", "gherkin", "glsl", "go", "graphql",
    "groovy", "haskell", "html", "java", "javascript", "json", "julia",
    "kotlin", "latex", "less", "lisp", "livescript", "lua", "makefile",
    "markdown", "markup", "matlab", "mermaid", "nix", "objective-c", "ocaml",
    "pascal", "perl", "php", "plain text", "powershell", "prolog",
    "protobuf", "python", "r", "reason", "ruby", "rust", "scala",
    "scss", "shell", "sql", "swift", "typescript", "vb.net", "verilog",
    "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#",
}

# ファイル名 → Notion 言語名のマッピング
LANG_MAP = {
    "sh": "bash", "zsh": "bash", "fish": "bash",
    "js": "javascript", "jsx": "javascript",
    "ts": "typescript", "tsx": "typescript",
    "py": "python",
    "rb": "ruby",
    "yml": "yaml",
    "dockerfile": "docker",
    "tf": "plain text",
    "mdx": "markdown",
    "md": "markdown",
}


# ─────────────────────────────────────────────
# Notion API ヘルパー
# ─────────────────────────────────────────────

def notion_request(method, endpoint, data=None, retries=3):
    url = f"https://api.notion.com/v1{endpoint}"
    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            if data is not None:
                req.data = json.dumps(data).encode("utf-8")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            if e.code == 429 and attempt < retries - 1:
                wait = (attempt + 1) * 3
                print(f"    [rate limit] {wait}s 待機...")
                time.sleep(wait)
            elif e.code >= 500 and attempt < retries - 1:
                time.sleep(2)
            else:
                raise RuntimeError(f"Notion API {e.code}: {body}")
        except Exception:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                raise


def get_child_pages(parent_id):
    """parent_id の直下にある child_page ブロックを {title: block_id} で返す。"""
    pages = {}
    cursor = None
    while True:
        params = f"?page_size=100"
        if cursor:
            params += f"&start_cursor={cursor}"
        result = notion_request("GET", f"/blocks/{parent_id}/children{params}")
        for block in result.get("results", []):
            if block.get("type") == "child_page":
                title = block["child_page"].get("title", "")
                pages[title] = block["id"]
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
    return pages


def archive_page(page_id):
    notion_request("PATCH", f"/pages/{page_id}", {"archived": True})


def create_child_page(parent_id, title):
    result = notion_request("POST", "/pages", {
        "parent": {"page_id": parent_id},
        "properties": {
            "title": {"title": [{"type": "text", "text": {"content": title[:2000]}}]}
        },
    })
    return result["id"]


def append_blocks(page_id, blocks):
    """100 ブロック単位でバッチ送信。"""
    for i in range(0, len(blocks), 100):
        batch = blocks[i:i + 100]
        notion_request("PATCH", f"/blocks/{page_id}/children", {"children": batch})
        if i + 100 < len(blocks):
            time.sleep(0.35)


# ─────────────────────────────────────────────
# Markdown → Notion blocks 変換
# ─────────────────────────────────────────────

def chunk_text(text, max_len=2000):
    chunks = []
    while len(text) > max_len:
        chunks.append(text[:max_len])
        text = text[max_len:]
    if text:
        chunks.append(text)
    return chunks


def parse_inline(text):
    """インライン markdown を Notion rich_text 配列に変換。"""
    if not text:
        return []

    rich_text = []
    # 順序重要: *** → ** → * の順でマッチさせる
    pattern = r'(`[^`\n]+?`|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|~~[^~\n]+?~~)'
    parts = re.split(pattern, text)

    for part in parts:
        if not part:
            continue
        ann = {"bold": False, "italic": False, "code": False,
               "strikethrough": False, "underline": False, "color": "default"}
        content = part

        if part.startswith("`") and part.endswith("`") and len(part) > 2:
            content = part[1:-1]
            ann["code"] = True
        elif part.startswith("***") and part.endswith("***") and len(part) > 6:
            content = part[3:-3]
            ann["bold"] = True
            ann["italic"] = True
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            content = part[2:-2]
            ann["bold"] = True
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            content = part[1:-1]
            ann["italic"] = True
        elif part.startswith("~~") and part.endswith("~~") and len(part) > 4:
            content = part[2:-2]
            ann["strikethrough"] = True

        for chunk in chunk_text(content, 2000):
            rich_text.append({
                "type": "text",
                "text": {"content": chunk},
                "annotations": ann,
            })

    return rich_text


def normalize_lang(lang):
    lang = lang.lower().strip()
    lang = LANG_MAP.get(lang, lang)
    return lang if lang in NOTION_LANGUAGES else "plain text"


def md_to_blocks(content):
    """Markdown テキストを Notion block リストに変換。"""
    blocks = []
    lines = content.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # ─ コードブロック ─
        if line.startswith("```"):
            lang = normalize_lang(line[3:].strip() or "plain text")
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # closing ```
            code_text = "\n".join(code_lines)
            for chunk in chunk_text(code_text, 2000):
                blocks.append({
                    "type": "code",
                    "code": {
                        "rich_text": [{"type": "text", "text": {"content": chunk}}],
                        "language": lang,
                    },
                })
            continue

        # ─ 区切り線 ─
        if re.match(r"^[-*_]{3,}\s*$", line):
            blocks.append({"type": "divider", "divider": {}})
            i += 1
            continue

        # ─ 見出し ─
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            level = len(m.group(1))
            text = m.group(2)
            if level == 1:
                btype = "heading_1"
            elif level == 2:
                btype = "heading_2"
            else:
                btype = "heading_3"  # h4-h6 も h3 に
            blocks.append({
                "type": btype,
                btype: {"rich_text": parse_inline(text)},
            })
            i += 1
            continue

        # ─ 箇条書き ─
        m = re.match(r"^(\s*)[-*+]\s+(.*)", line)
        if m:
            blocks.append({
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": parse_inline(m.group(2))},
            })
            i += 1
            continue

        # ─ 番号付きリスト ─
        m = re.match(r"^(\s*)\d+[.)]\s+(.*)", line)
        if m:
            blocks.append({
                "type": "numbered_list_item",
                "numbered_list_item": {"rich_text": parse_inline(m.group(2))},
            })
            i += 1
            continue

        # ─ 引用 ─
        if line.startswith("> "):
            blocks.append({
                "type": "quote",
                "quote": {"rich_text": parse_inline(line[2:])},
            })
            i += 1
            continue

        # ─ 画像（スキップ） ─
        if re.match(r"^!\[", line):
            i += 1
            continue

        # ─ 空行 ─
        if not line.strip():
            i += 1
            continue

        # ─ テーブル（段落として処理） ─
        if line.startswith("|"):
            # テーブル行をそのまま code paragraph として出力
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            table_text = "\n".join(table_lines)
            for chunk in chunk_text(table_text, 2000):
                blocks.append({
                    "type": "code",
                    "code": {
                        "rich_text": [{"type": "text", "text": {"content": chunk}}],
                        "language": "plain text",
                    },
                })
            continue

        # ─ 通常の段落（複数行を連結） ─
        para_lines = []
        stop_patterns = (
            lambda l: l.startswith("#"),
            lambda l: l.startswith("```"),
            lambda l: re.match(r"^[-*+]\s", l) is not None,
            lambda l: re.match(r"^\d+[.)]\s", l) is not None,
            lambda l: l.startswith("> "),
            lambda l: l.startswith("|"),
            lambda l: re.match(r"^[-*_]{3,}\s*$", l) is not None,
            lambda l: not l.strip(),
        )
        while i < len(lines):
            l = lines[i]
            if any(fn(l) for fn in stop_patterns):
                break
            para_lines.append(l)
            i += 1

        para_text = " ".join(para_lines).strip()
        if para_text:
            blocks.append({
                "type": "paragraph",
                "paragraph": {"rich_text": parse_inline(para_text)},
            })

    return blocks


def get_title(filepath, content):
    """ファイルの最初の H1 をタイトルとして返す。なければファイル名。"""
    m = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return os.path.splitext(os.path.basename(filepath))[0]


# ─────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────

def main():
    handson_dir = os.path.abspath(HANDSON_DIR)
    md_files = sorted(f for f in os.listdir(handson_dir) if f.endswith(".md"))
    print(f"対象ファイル: {len(md_files)} 件\n")

    existing = get_child_pages(PARENT_PAGE_ID)
    print(f"既存 Notion ページ: {list(existing.keys()) or 'なし'}\n")

    ok = 0
    ng = []

    for filename in md_files:
        filepath = os.path.join(handson_dir, filename)
        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        title = get_title(filepath, content)
        blocks = md_to_blocks(content)
        print(f"[{filename}]  →  「{title}」 ({len(blocks)} blocks)")

        try:
            # 既存ページがあれば archive して再作成
            if title in existing:
                print(f"  既存ページを archive...")
                archive_page(existing[title])
                time.sleep(0.4)

            page_id = create_child_page(PARENT_PAGE_ID, title)
            time.sleep(0.3)

            if blocks:
                append_blocks(page_id, blocks)

            print(f"  ✓ 完了")
            ok += 1
        except Exception as e:
            print(f"  ✗ エラー: {e}")
            ng.append(filename)

        time.sleep(0.5)

    print(f"\n── 同期完了 ── 成功: {ok} / 失敗: {len(ng)}")
    if ng:
        print(f"失敗ファイル: {ng}")


if __name__ == "__main__":
    main()
