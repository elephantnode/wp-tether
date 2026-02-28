import { execFile, execSync } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { Dirent } from "fs";
import type {
  SecurityVersionInfo,
  SecurityFileScanResult,
  SecurityFileScanIssue,
  SecurityRecommendation,
  SecurityScanResult,
  SecurityVulnerabilityCheck,
  SecurityNpmAuditResult,
  SecurityHeadersResult,
  SecurityHeaderCheck,
  SecurityExposureResult,
  SecurityExposureItem,
  SecurityWpConfigResult,
  SecurityWpConfigCheck,
} from "@/types";
import {
  fetchCoreVulnerabilities,
  fetchPluginVulnerabilities,
  fetchThemeVulnerabilities,
} from "@/lib/wpvulnerability";

const execFileAsync = promisify(execFile);

const WPCLI_TIMEOUT_MS = 60_000;

/**
 * サイトの docker compose で WP-CLI を実行
 */
async function runWpCli(
  sitePath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(
    "docker",
    ["compose", "run", "--rm", "wpcli", ...args],
    {
      cwd: sitePath,
      timeout: WPCLI_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    }
  );
  return { stdout: stdout ?? "", stderr: stderr ?? "" };
}

/**
 * WP-CLI でバージョン情報を取得（サイト稼働中であること前提）
 */
export async function getVersionInfo(sitePath: string): Promise<SecurityVersionInfo> {
  const result: SecurityVersionInfo = {
    plugins: [],
    themes: [],
  };

  try {
    const [coreRes, pluginRes, themeRes, phpRes] = await Promise.all([
      runWpCli(sitePath, ["core", "version", "--quiet"]).catch(() => ({ stdout: "", stderr: "" })),
      runWpCli(sitePath, ["plugin", "list", "--format=json", "--fields=name,version,status"]).catch(() => ({
        stdout: "[]",
        stderr: "",
      })),
      runWpCli(sitePath, ["theme", "list", "--format=json", "--fields=name,version,status"]).catch(() => ({
        stdout: "[]",
        stderr: "",
      })),
      runWpCli(sitePath, ["eval", "echo PHP_VERSION;"]).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const wpVersion = coreRes.stdout.trim();
    if (wpVersion && !coreRes.stderr) result.wordpress = wpVersion;

    const phpVersion = phpRes.stdout.trim();
    if (phpVersion && !phpRes.stderr) result.php = phpVersion;

    try {
      const plugins = JSON.parse(pluginRes.stdout || "[]") as { name: string; version: string; status: string }[];
      result.plugins = plugins.map((p) => ({
        name: p.name,
        version: p.version || "",
        status: p.status === "active" ? "active" : "inactive",
      }));
    } catch {
      result.plugins = [];
    }

    try {
      const themes = JSON.parse(themeRes.stdout || "[]") as { name: string; version: string; status: string }[];
      result.themes = themes.map((t) => ({
        name: t.name,
        version: t.version || "",
        status: t.status === "active" ? "active" : "inactive",
      }));
    } catch {
      result.themes = [];
    }
  } catch {
    // 各取得は個別に catch しているのでここにはほぼ来ない
  }

  return result;
}

/** スキャン対象の危険な PHP パターン（eval, 難読化の兆候など） */
const SUSPICIOUS_PHP_PATTERNS = [
  { id: "eval", pattern: /\beval\s*\(/i },
  { id: "base64_decode", pattern: /\bbase64_decode\s*\(/i },
  { id: "gzinflate", pattern: /\bgzinflate\s*\(/i },
  { id: "gzuncompress", pattern: /\bgzuncompress\s*\(/i },
  { id: "str_rot13", pattern: /\bstr_rot13\s*\(/i },
  { id: "system", pattern: /\bsystem\s*\(/i },
  { id: "exec", pattern: /\bexec\s*\(/i },
  { id: "shell_exec", pattern: /\bshell_exec\s*\(/i },
  { id: "passthru", pattern: /\bpassthru\s*\(/i },
  { id: "popen", pattern: /\bpopen\s*\(/i },
  { id: "proc_open", pattern: /\bproc_open\s*\(/i },
  { id: "assert_with_string", pattern: /\bassert\s*\(\s*['"`]/i },
  { id: "create_function", pattern: /\bcreate_function\s*\(/i },
  { id: "preg_replace_e", pattern: /preg_replace\s*\([^,]*\/e\s*[,'"]/i },
  { id: "file_put_contents_curl", pattern: /file_put_contents\s*\([^,]*,\s*(?:curl_|file_get_contents\s*\(['"]https?:\/\/)/i },
];

/** スキャン対象の危険な JavaScript パターン（XSS・コード実行の兆候など） */
const SUSPICIOUS_JS_PATTERNS = [
  { id: "eval", pattern: /\beval\s*\(/i },
  { id: "Function_constructor", pattern: /\bnew\s+Function\s*\(/i },
  { id: "document.write", pattern: /\bdocument\.write\s*\(/i },
  { id: "innerHTML_assign", pattern: /\.innerHTML\s*=/i },
  { id: "outerHTML_assign", pattern: /\.outerHTML\s*=/i },
  { id: "document.writeln", pattern: /\bdocument\.writeln\s*\(/i },
  { id: "setTimeout_string", pattern: /\bsetTimeout\s*\(\s*['"`]/i },
  { id: "setInterval_string", pattern: /\bsetInterval\s*\(\s*['"`]/i },
  { id: "script_injection", pattern: /<script[\s>]/i },
  { id: "location_assign", pattern: /\blocation\s*=\s*['"`]?\s*javascript:/i },
];

const SCAN_EXT = [".php", ".js"];
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git"]);

type PatternEntry = { id: string; pattern: RegExp };

/**
 * 1ファイルをスキャンし、該当行とパターンを返す（拡張子で PHP / JS のパターンを使い分け）
 */
async function scanOneFile(
  absolutePath: string,
  relativePath: string
): Promise<SecurityFileScanIssue[]> {
  const issues: SecurityFileScanIssue[] = [];
  let content: string;
  try {
    content = await fs.readFile(absolutePath, "utf-8");
  } catch {
    return [];
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const patterns: PatternEntry[] =
    ext === ".js" ? SUSPICIOUS_JS_PATTERNS : SUSPICIOUS_PHP_PATTERNS;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { id, pattern } of patterns) {
      if (pattern.test(line)) {
        const snippet = line.trim().slice(0, 120);
        issues.push({
          path: relativePath,
          line: i + 1,
          pattern: id,
          snippet: snippet.length < line.trim().length ? `${snippet}…` : snippet,
        });
      }
    }
  }
  return issues;
}

/**
 * ディレクトリを再帰的に走査し、PHP / JS ファイルをスキャン
 */
async function walkAndScan(
  dirAbsolute: string,
  dirRelative: string,
  acc: { filesScanned: number; issues: SecurityFileScanIssue[] }
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirAbsolute, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    const name = e.name;
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;

    const abs = path.join(dirAbsolute, name);
    const rel = path.join(dirRelative, name);

    if (e.isDirectory()) {
      await walkAndScan(abs, rel, acc);
      continue;
    }

    const ext = path.extname(name).toLowerCase();
    if (!SCAN_EXT.includes(ext)) continue;

    acc.filesScanned += 1;
    const issues = await scanOneFile(abs, rel);
    acc.issues.push(...issues);
  }
}

/** npm audit の JSON 出力（metadata のみ使用） */
interface NpmAuditJson {
  metadata?: {
    vulnerabilities?: {
      info?: number;
      low?: number;
      moderate?: number;
      high?: number;
      critical?: number;
    };
  };
}

const NPM_AUDIT_TIMEOUT_MS = 60_000;

const ZERO_VULN = {
  critical: 0,
  high: 0,
  moderate: 0,
  low: 0,
  info: 0,
};

/**
 * wp-content 配下で package.json があるディレクトリを列挙（plugins, themes のみ）
 */
async function findPackageJsonDirs(wpContentPath: string): Promise<string[]> {
  const dirs: string[] = [];
  for (const sub of ["plugins", "themes"]) {
    const base = path.join(wpContentPath, sub);
    let entries: Dirent[];
    try {
      entries = await fs.readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const pkgPath = path.join(base, e.name, "package.json");
      try {
        await fs.access(pkgPath);
        dirs.push(path.join(base, e.name));
      } catch {
        // package.json なし
      }
    }
  }
  return dirs;
}

/**
 * 1ディレクトリで npm audit --json を実行し、結果を返す
 * 脆弱性がある場合も npm は exit 1 で JSON を stdout に出すため、execSync で throw 時に stdout を取得
 */
async function runNpmAuditInDir(
  dirAbsolute: string,
  projectPathRelative: string
): Promise<SecurityNpmAuditResult> {
  let stdout = "";
  try {
    stdout = execSync("npm audit --json", {
      cwd: dirAbsolute,
      encoding: "utf-8",
      timeout: NPM_AUDIT_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    stdout = e.stdout ?? "";
    if (!stdout && e.status !== undefined) {
      return {
        projectPath: projectPathRelative,
        error: `npm audit が終了コード ${e.status} で終了しました`,
        vulnerabilities: ZERO_VULN,
      };
    }
  }
  try {
    const data: NpmAuditJson = JSON.parse(stdout || "{}");
    const v = data.metadata?.vulnerabilities ?? {};
    return {
      projectPath: projectPathRelative,
      vulnerabilities: {
        critical: v.critical ?? 0,
        high: v.high ?? 0,
        moderate: v.moderate ?? 0,
        low: v.low ?? 0,
        info: v.info ?? 0,
      },
    };
  } catch {
    return {
      projectPath: projectPathRelative,
      error: "npm audit の出力を解析できませんでした",
      vulnerabilities: ZERO_VULN,
    };
  }
}

/**
 * wp-content 配下の package.json があるディレクトリで npm audit を実行
 */
export async function runNpmAudit(sitePath: string): Promise<SecurityNpmAuditResult[]> {
  const wpContent = path.join(sitePath, "src", "wp-content");
  const dirs = await findPackageJsonDirs(wpContent);
  const results: SecurityNpmAuditResult[] = [];
  for (const dirAbsolute of dirs) {
    const projectPath = path.relative(wpContent, dirAbsolute);
    const normalized = projectPath.replace(/\\/g, "/");
    const result = await runNpmAuditInDir(dirAbsolute, normalized);
    results.push(result);
  }
  return results;
}

/**
 * wp-content 配下をスキャン（plugins, themes, uploads, mu-plugins）
 */
export async function runFileScan(sitePath: string): Promise<SecurityFileScanResult> {
  const wpContent = path.join(sitePath, "src", "wp-content");
  const scannedDirs: string[] = [];
  const acc = { filesScanned: 0, issues: [] as SecurityFileScanIssue[] };

  const subdirs = ["plugins", "themes", "uploads", "mu-plugins"];
  for (const sub of subdirs) {
    const abs = path.join(wpContent, sub);
    try {
      await fs.access(abs);
    } catch {
      continue;
    }
    scannedDirs.push(`wp-content/${sub}`);
    await walkAndScan(abs, `wp-content/${sub}`, acc);
  }

  return {
    scannedDirs,
    filesScanned: acc.filesScanned,
    issues: acc.issues,
  };
}

// ===========================================
// HTTPセキュリティヘッダチェック
// ===========================================

/** チェックするセキュリティヘッダの定義 */
const SECURITY_HEADERS_TO_CHECK = [
  {
    name: "X-Frame-Options",
    recommended: "DENY または SAMEORIGIN",
    description: "クリックジャッキング攻撃を防止。iframeでの埋め込みを制御",
  },
  {
    name: "X-Content-Type-Options",
    recommended: "nosniff",
    description: "MIMEタイプスニッフィングを防止",
  },
  {
    name: "X-XSS-Protection",
    recommended: "1; mode=block",
    description: "ブラウザのXSSフィルタを有効化（レガシー対応）",
  },
  {
    name: "Strict-Transport-Security",
    recommended: "max-age=31536000; includeSubDomains",
    description: "HTTPS接続を強制（HSTS）",
  },
  {
    name: "Content-Security-Policy",
    recommended: "default-src 'self'（カスタマイズ推奨）",
    description: "スクリプト・スタイル等の読み込み元を制限しXSSを防止",
  },
  {
    name: "Referrer-Policy",
    recommended: "strict-origin-when-cross-origin",
    description: "リファラ情報の送信を制御",
  },
  {
    name: "Permissions-Policy",
    recommended: "geolocation=(), microphone=(), camera=()",
    description: "ブラウザ機能（位置情報、カメラ等）へのアクセスを制限",
  },
];

const HTTP_TIMEOUT_MS = 10_000;

/**
 * サイトにHTTPリクエストを送信し、セキュリティヘッダをチェック
 */
export async function checkSecurityHeaders(
  siteUrl: string
): Promise<SecurityHeadersResult> {
  const headers: SecurityHeaderCheck[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const res = await fetch(siteUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    for (const def of SECURITY_HEADERS_TO_CHECK) {
      const value = res.headers.get(def.name);
      headers.push({
        name: def.name,
        value: value ?? undefined,
        present: !!value,
        recommended: def.recommended,
        description: def.description,
      });
    }

    return { checked: true, headers };
  } catch (err) {
    return {
      checked: false,
      skippedReason: `HTTPリクエストに失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`,
      headers: [],
    };
  }
}

// ===========================================
// WordPress露出チェック
// ===========================================

/**
 * WordPress固有の情報露出をチェック
 */
export async function checkWordPressExposure(
  siteUrl: string
): Promise<SecurityExposureResult> {
  const items: SecurityExposureItem[] = [];

  const checks = [
    {
      id: "wp-json-version",
      name: "REST API バージョン露出",
      path: "/wp-json/",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) return { exposed: false };
          const data = await res.json();
          const wpVersion = data?.namespaces?.includes("wp/v2") ? "v2" : undefined;
          const genTag = data?.["generator"] || undefined;
          return {
            exposed: !!data?.namespaces,
            detail: genTag || (wpVersion ? `REST API ${wpVersion}` : undefined),
          };
        } catch {
          return { exposed: false };
        }
      },
      risk: "WordPressのバージョン情報が取得される可能性があります",
      mitigation: "REST APIの制限またはバージョン情報の非表示化を検討",
    },
    {
      id: "author-enumeration",
      name: "ユーザー名列挙",
      path: "/?author=1",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "GET", redirect: "manual" });
          const location = res.headers.get("location") || "";
          // /author/username/ にリダイレクトされるとユーザー名が露出
          const match = location.match(/\/author\/([^/]+)/);
          if (match) {
            return { exposed: true, detail: `ユーザー名: ${match[1]}` };
          }
          return { exposed: false };
        } catch {
          return { exposed: false };
        }
      },
      risk: "管理者のユーザー名が推測され、ブルートフォース攻撃に使われる可能性",
      mitigation: "author リダイレクトの無効化またはプラグインで対策",
    },
    {
      id: "xmlrpc",
      name: "XML-RPC エンドポイント",
      path: "/xmlrpc.php",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "POST", body: "<?xml version=\"1.0\"?><methodCall><methodName>system.listMethods</methodName></methodCall>" });
          const text = await res.text();
          const hasXmlRpc = text.includes("methodResponse") || res.status === 200;
          return { exposed: hasXmlRpc, detail: hasXmlRpc ? "有効" : undefined };
        } catch {
          return { exposed: false };
        }
      },
      risk: "XML-RPCはブルートフォース攻撃やDDoS増幅に悪用される可能性",
      mitigation: "XML-RPCを無効化（プラグインまたは.htaccess）",
    },
    {
      id: "readme-html",
      name: "readme.html 露出",
      path: "/readme.html",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "HEAD" });
          return { exposed: res.ok, detail: res.ok ? "存在" : undefined };
        } catch {
          return { exposed: false };
        }
      },
      risk: "WordPressのバージョン情報が含まれている可能性",
      mitigation: "readme.html を削除",
    },
    {
      id: "license-txt",
      name: "license.txt 露出",
      path: "/license.txt",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "HEAD" });
          return { exposed: res.ok, detail: res.ok ? "存在" : undefined };
        } catch {
          return { exposed: false };
        }
      },
      risk: "WordPressであることが判別できる",
      mitigation: "license.txt を削除",
    },
    {
      id: "wp-config-backup",
      name: "wp-config.php バックアップ",
      path: "/wp-config.php.bak",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "HEAD" });
          // バックアップファイルが見える = 危険
          return { exposed: res.ok, detail: res.ok ? "アクセス可能" : undefined };
        } catch {
          return { exposed: false };
        }
      },
      risk: "データベース認証情報など機密情報が漏洩する危険性",
      mitigation: "バックアップファイルを削除し、Webルートに配置しない",
    },
    {
      id: "directory-listing-uploads",
      name: "uploads ディレクトリリスティング",
      path: "/wp-content/uploads/",
      check: async (url: string) => {
        try {
          const res = await fetch(url, { method: "GET" });
          const text = await res.text();
          // Index of が含まれていればディレクトリリスティングが有効
          const hasListing = text.includes("Index of") || text.includes("<title>Index");
          return { exposed: hasListing, detail: hasListing ? "一覧表示が有効" : undefined };
        } catch {
          return { exposed: false };
        }
      },
      risk: "アップロードファイルの一覧が外部から閲覧可能",
      mitigation: ".htaccess で Options -Indexes を設定",
    },
  ];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS * 2);

    await Promise.all(
      checks.map(async (c) => {
        const fullUrl = siteUrl.replace(/\/$/, "") + c.path;
        const result = await c.check(fullUrl);
        items.push({
          id: c.id,
          name: c.name,
          path: c.path,
          exposed: result.exposed,
          detail: result.detail,
          risk: c.risk,
          mitigation: c.mitigation,
        });
      })
    );

    clearTimeout(timeoutId);
    return { checked: true, items };
  } catch {
    return {
      checked: false,
      skippedReason: "露出チェックに失敗しました",
      items: [],
    };
  }
}

// ===========================================
// wp-config.php 設定チェック
// ===========================================

/**
 * wp-config.php の内容をチェック（ローカルファイルを読む）
 */
export async function checkWpConfig(sitePath: string): Promise<SecurityWpConfigResult> {
  const wpConfigPath = path.join(sitePath, "src", "wp-config.php");
  const items: SecurityWpConfigCheck[] = [];

  let content: string;
  try {
    content = await fs.readFile(wpConfigPath, "utf-8");
  } catch {
    return {
      checked: false,
      skippedReason: "wp-config.php が見つかりません",
      items: [],
    };
  }

  // WP_DEBUG チェック
  const debugMatch = content.match(/define\s*\(\s*['"]WP_DEBUG['"]\s*,\s*(true|false|[^)]+)\s*\)/i);
  const debugValue = debugMatch ? debugMatch[1].trim() : "未設定";
  const isDebugOn = debugValue.toLowerCase() === "true";
  items.push({
    id: "wp-debug",
    name: "WP_DEBUG",
    currentValue: debugValue,
    recommendedValue: "false（本番環境）",
    hasIssue: isDebugOn,
    description: "デバッグモードが有効だとエラー詳細が表示され、攻撃者に情報を与える可能性があります",
  });

  // WP_DEBUG_LOG チェック
  const debugLogMatch = content.match(/define\s*\(\s*['"]WP_DEBUG_LOG['"]\s*,\s*(true|false|[^)]+)\s*\)/i);
  const debugLogValue = debugLogMatch ? debugLogMatch[1].trim() : "未設定";
  const isDebugLogOn = debugLogValue.toLowerCase() === "true";
  items.push({
    id: "wp-debug-log",
    name: "WP_DEBUG_LOG",
    currentValue: debugLogValue,
    recommendedValue: "false または非公開パス",
    hasIssue: isDebugLogOn && isDebugOn,
    description: "デバッグログが公開ディレクトリに出力されると機密情報が漏洩する可能性",
  });

  // WP_DEBUG_DISPLAY チェック
  const debugDisplayMatch = content.match(/define\s*\(\s*['"]WP_DEBUG_DISPLAY['"]\s*,\s*(true|false|[^)]+)\s*\)/i);
  const debugDisplayValue = debugDisplayMatch ? debugDisplayMatch[1].trim() : "未設定";
  const isDebugDisplayOn = debugDisplayValue.toLowerCase() === "true" || (debugDisplayValue === "未設定" && isDebugOn);
  items.push({
    id: "wp-debug-display",
    name: "WP_DEBUG_DISPLAY",
    currentValue: debugDisplayValue,
    recommendedValue: "false",
    hasIssue: isDebugDisplayOn,
    description: "エラーをブラウザに表示すると、パス情報やPHPバージョンが漏洩する可能性",
  });

  // DISALLOW_FILE_EDIT チェック
  const fileEditMatch = content.match(/define\s*\(\s*['"]DISALLOW_FILE_EDIT['"]\s*,\s*(true|false|[^)]+)\s*\)/i);
  const fileEditValue = fileEditMatch ? fileEditMatch[1].trim() : "未設定";
  const fileEditDisabled = fileEditValue.toLowerCase() === "true";
  items.push({
    id: "disallow-file-edit",
    name: "DISALLOW_FILE_EDIT",
    currentValue: fileEditValue,
    recommendedValue: "true",
    hasIssue: !fileEditDisabled,
    description: "管理画面からのテーマ/プラグイン編集を無効化。乗っ取り時の被害を軽減",
  });

  // DISALLOW_FILE_MODS チェック
  const fileModsMatch = content.match(/define\s*\(\s*['"]DISALLOW_FILE_MODS['"]\s*,\s*(true|false|[^)]+)\s*\)/i);
  const fileModsValue = fileModsMatch ? fileModsMatch[1].trim() : "未設定";
  items.push({
    id: "disallow-file-mods",
    name: "DISALLOW_FILE_MODS",
    currentValue: fileModsValue,
    recommendedValue: "true（本番環境で推奨）",
    hasIssue: false, // 開発環境ではfalseでも問題ない
    description: "プラグイン/テーマのインストール・更新を無効化（本番環境向け）",
  });

  // AUTH_KEY 等のソルトチェック
  const saltKeys = ["AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY"];
  const weakSalts: string[] = [];
  for (const key of saltKeys) {
    const regex = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*['"]([^'"]*)['"]]\\s*\\)`, "i");
    const match = content.match(regex);
    if (match) {
      const salt = match[1];
      // 弱いソルト: 短すぎる、デフォルト値、空
      if (!salt || salt.length < 32 || salt.includes("put your unique phrase here")) {
        weakSalts.push(key);
      }
    } else {
      weakSalts.push(key);
    }
  }
  items.push({
    id: "auth-salts",
    name: "認証キー（ソルト）",
    currentValue: weakSalts.length > 0 ? `問題あり: ${weakSalts.join(", ")}` : "設定済み",
    recommendedValue: "ランダムな64文字以上の文字列",
    hasIssue: weakSalts.length > 0,
    description: "認証キーはセッションセキュリティに影響。wordpress.org/secret-key で生成推奨",
  });

  // テーブルプレフィックスチェック
  const prefixMatch = content.match(/\$table_prefix\s*=\s*['"]([^'"]+)['"]/);
  const prefix = prefixMatch ? prefixMatch[1] : "不明";
  items.push({
    id: "table-prefix",
    name: "テーブルプレフィックス",
    currentValue: prefix,
    recommendedValue: "wp_ 以外のランダムな値",
    hasIssue: prefix === "wp_",
    description: "デフォルトの wp_ はSQLインジェクション攻撃のターゲットになりやすい",
  });

  return { checked: true, items };
}

// ===========================================
// 古いデフォルトテーマ警告
// ===========================================

/** 古いデフォルトテーマ（削除推奨） */
const OLD_DEFAULT_THEMES = [
  "twentyten",
  "twentyeleven",
  "twentytwelve",
  "twentythirteen",
  "twentyfourteen",
  "twentyfifteen",
  "twentysixteen",
  "twentyseventeen",
  "twentynineteen",
  "twentytwenty",
  "twentytwentyone",
];

/**
 * 古いデフォルトテーマの存在をチェックし、推奨事項に追加
 */
function addOldThemeRecommendations(
  recs: SecurityRecommendation[],
  themes: { name: string; status: "active" | "inactive" }[]
): void {
  const oldThemes = themes.filter(
    (t) => OLD_DEFAULT_THEMES.includes(t.name) && t.status === "inactive"
  );
  if (oldThemes.length > 0) {
    recs.push({
      id: "old-default-themes",
      level: "info",
      title: "古いデフォルトテーマの削除推奨",
      message:
        "使用していない古いデフォルトテーマが残っています。脆弱性が発見された場合にリスクとなるため、不要なら削除してください。",
      detail: oldThemes.map((t) => t.name),
    });
  }
}

/**
 * セキュリティヘッダチェック結果から推奨事項を追加
 */
function addSecurityHeaderRecommendations(
  recs: SecurityRecommendation[],
  headersResult: SecurityHeadersResult
): void {
  if (!headersResult.checked) return;

  const missingHeaders = headersResult.headers.filter((h) => !h.present);
  if (missingHeaders.length > 0) {
    const critical = missingHeaders.filter((h) =>
      ["X-Frame-Options", "X-Content-Type-Options", "Content-Security-Policy"].includes(h.name)
    );
    recs.push({
      id: "security-headers",
      level: critical.length > 0 ? "warning" : "info",
      title: "HTTPセキュリティヘッダが未設定",
      message:
        "重要なセキュリティヘッダが設定されていません。本番環境ではWebサーバーまたはプラグインで設定してください。",
      detail: missingHeaders.map((h) => h.name),
    });
  }
}

/**
 * WordPress露出チェック結果から推奨事項を追加
 */
function addExposureRecommendations(
  recs: SecurityRecommendation[],
  exposureResult: SecurityExposureResult
): void {
  if (!exposureResult.checked) return;

  const exposedItems = exposureResult.items.filter((i) => i.exposed);
  if (exposedItems.length > 0) {
    const criticalIds = ["xmlrpc", "wp-config-backup", "directory-listing-uploads"];
    const hasCritical = exposedItems.some((i) => criticalIds.includes(i.id));
    recs.push({
      id: "wp-exposure",
      level: hasCritical ? "warning" : "info",
      title: "WordPress情報が露出しています",
      message:
        "外部からWordPressの情報やエンドポイントにアクセス可能です。不要なものは無効化・削除してください。",
      detail: exposedItems.map((i) => `${i.name}: ${i.detail || "露出"}`),
    });
  }
}

/**
 * wp-config.php チェック結果から推奨事項を追加
 */
function addWpConfigRecommendations(
  recs: SecurityRecommendation[],
  wpConfigResult: SecurityWpConfigResult
): void {
  if (!wpConfigResult.checked) return;

  const issues = wpConfigResult.items.filter((i) => i.hasIssue);
  if (issues.length > 0) {
    const hasDebugIssue = issues.some((i) => i.id.startsWith("wp-debug"));
    recs.push({
      id: "wp-config-issues",
      level: hasDebugIssue ? "warning" : "info",
      title: "wp-config.php のセキュリティ設定",
      message:
        "wp-config.php の設定を見直してください。特にデバッグモードは本番環境では無効にすべきです。",
      detail: issues.map((i) => `${i.name}: ${i.currentValue}`),
    });
  }
}

/** PHP セキュリティサポート終了日（簡易） */
const PHP_EOL: Record<string, string> = {
  "8.0": "2025-11",
  "8.1": "2025-12",
  "8.2": "2026-12",
  "8.3": "2027-12",
  "8.4": "2028-12",
};

function getPhpEolStatus(version: string): "supported" | "eol" | "unknown" {
  const majorMinor = version.replace(/^(\d+\.\d+).*$/, "$1");
  const eol = PHP_EOL[majorMinor];
  if (!eol) return "unknown";
  const eolDate = new Date(eol + "-01");
  return new Date() > eolDate ? "eol" : "supported";
}

/**
 * バージョン情報とファイルスキャン結果から推奨事項を生成
 */
export function buildRecommendations(
  version: SecurityVersionInfo,
  fileScan: SecurityFileScanResult
): SecurityRecommendation[] {
  const recs: SecurityRecommendation[] = [];

  // 無効化されたプラグインは削除を推奨（記事: 使っていないプラグインの存在）
  const inactivePlugins = version.plugins.filter((p) => p.status === "inactive");
  if (inactivePlugins.length > 0) {
    recs.push({
      id: "inactive-plugins",
      level: "warning",
      title: "無効化されたプラグイン",
      message:
        "無効化しただけのプラグインはファイルが残り攻撃対象になり得ます。不要なものは削除してください。",
      detail: inactivePlugins.map((p) => p.name),
    });
  }

  // PHP サポート終了
  if (version.php) {
    const phpStatus = getPhpEolStatus(version.php);
    if (phpStatus === "eol") {
      recs.push({
        id: "php-eol",
        level: "warning",
        title: "PHP のセキュリティサポート終了",
        message: `PHP ${version.php} はセキュリティサポートが終了しています。PHP 8.2 以上へのアップデートを推奨します。`,
        detail: [version.php],
      });
    } else if (phpStatus === "unknown") {
      recs.push({
        id: "php-unknown",
        level: "info",
        title: "PHP バージョン",
        message: `現在のバージョン: ${version.php}。サポート状況は PHP 公式を確認してください。`,
        detail: [version.php],
      });
    }
  }

  // 不審なコードパターン
  if (fileScan.issues.length > 0) {
    const byPattern = new Map<string, number>();
    for (const i of fileScan.issues) {
      byPattern.set(i.pattern, (byPattern.get(i.pattern) ?? 0) + 1);
    }
    const topPatterns = [...byPattern.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `${p}(${c}件)`);
    recs.push({
      id: "suspicious-patterns",
      level: fileScan.issues.length > 10 ? "warning" : "info",
      title: "不審なコードパターンの検出",
      message:
        "eval や base64_decode など、マルウェアでよく使われるパターンが含まれているファイルがあります。正規のプラグイン・テーマでも使われる場合がありますが、心当たりのない場合は要確認です。",
      detail: topPatterns,
    });
  }

  return recs;
}

/**
 * WPVulnerability API でコア・プラグイン・テーマの脆弱性を取得
 */
async function fetchVulnerabilityChecks(
  version: SecurityVersionInfo
): Promise<SecurityVulnerabilityCheck[]> {
  const results: SecurityVulnerabilityCheck[] = [];

  if (version.wordpress) {
    const vulns = await fetchCoreVulnerabilities(version.wordpress);
    if (vulns.length > 0) {
      results.push({
        type: "core",
        name: "WordPress",
        installedVersion: version.wordpress,
        vulnerabilities: vulns,
      });
    }
  }

  const pluginPromises = version.plugins.map(async (p) => {
    const vulns = await fetchPluginVulnerabilities(p.name, p.version);
    if (vulns.length === 0) return null;
    return {
      type: "plugin" as const,
      name: p.name,
      slug: p.name,
      installedVersion: p.version,
      vulnerabilities: vulns,
    };
  });
  const pluginResults = await Promise.all(pluginPromises);
  for (const r of pluginResults) {
    if (r) results.push(r);
  }

  const themePromises = version.themes.map(async (t) => {
    const vulns = await fetchThemeVulnerabilities(t.name, t.version);
    if (vulns.length === 0) return null;
    return {
      type: "theme" as const,
      name: t.name,
      slug: t.name,
      installedVersion: t.version,
      vulnerabilities: vulns,
    };
  });
  const themeResults = await Promise.all(themePromises);
  for (const r of themeResults) {
    if (r) results.push(r);
  }

  return results;
}

/**
 * npm audit 結果から推奨事項を追加
 */
function addNpmAuditRecommendations(
  recs: SecurityRecommendation[],
  npmAudit: SecurityNpmAuditResult[]
): void {
  const withVuln = npmAudit.filter(
    (r) =>
      !r.error &&
      (r.vulnerabilities.critical > 0 ||
        r.vulnerabilities.high > 0 ||
        r.vulnerabilities.moderate > 0 ||
        r.vulnerabilities.low > 0)
  );
  if (withVuln.length === 0) return;
  const detail = withVuln.map((r) => {
    const v = r.vulnerabilities;
    const parts = [];
    if (v.critical) parts.push(`critical:${v.critical}`);
    if (v.high) parts.push(`high:${v.high}`);
    if (v.moderate) parts.push(`moderate:${v.moderate}`);
    if (v.low) parts.push(`low:${v.low}`);
    return `${r.projectPath} (${parts.join(", ")})`;
  });
  recs.push({
    id: "npm-audit",
    level: "warning",
    title: "npm の依存関係に脆弱性があります",
    message:
      "package.json があるテーマ・プラグインで npm audit により脆弱性が検出されました。npm update や npm audit fix の実行を検討してください。",
    detail,
  });
}

/**
 * 脆弱性チェック結果から推奨事項を追加
 */
function addVulnerabilityRecommendations(
  recs: SecurityRecommendation[],
  vulnerabilityChecks: SecurityVulnerabilityCheck[]
): void {
  const total = vulnerabilityChecks.reduce(
    (sum, c) => sum + c.vulnerabilities.length,
    0
  );
  if (total === 0) return;
  const core = vulnerabilityChecks.find((c) => c.type === "core");
  const plugins = vulnerabilityChecks.filter((c) => c.type === "plugin");
  const themes = vulnerabilityChecks.filter((c) => c.type === "theme");
  const detail: string[] = [];
  if (core) detail.push(`WordPress ${core.installedVersion}: ${core.vulnerabilities.length}件`);
  if (plugins.length)
    detail.push(
      `プラグイン: ${plugins.map((p) => `${p.name}(${p.vulnerabilities.length})`).join(", ")}`
    );
  if (themes.length)
    detail.push(
      `テーマ: ${themes.map((t) => `${t.name}(${t.vulnerabilities.length})`).join(", ")}`
    );
  recs.push({
    id: "wpvulnerability",
    level: "warning",
    title: "既知の脆弱性が検出されました（WPVulnerability）",
    message: "WordPress・プラグイン・テーマに既知の脆弱性があります。可能な限りアップデートしてください。",
    detail,
  });
}

/**
 * ローカルサイトのセキュリティスキャンを一括実行
 * - バージョン取得はサイト稼働中のみ。停止中は fileScan のみ実行し versionSkippedReason を付与
 * - siteUrl が指定されていれば、HTTPヘッダ・WordPress露出チェックも実行
 */
export async function runSecurityScan(
  sitePath: string,
  siteRunning: boolean,
  siteUrl?: string
): Promise<SecurityScanResult> {
  const scannedAt = new Date().toISOString();

  let version: SecurityVersionInfo = { plugins: [], themes: [] };
  let versionSkippedReason: string | undefined;

  if (siteRunning) {
    version = await getVersionInfo(sitePath);
  } else {
    versionSkippedReason = "サイトが停止中のため、WordPress・PHP・プラグインのバージョンは取得していません。起動後に再スキャンしてください。";
  }

  const fileScan = await runFileScan(sitePath);
  const recommendations = buildRecommendations(version, fileScan);

  // 古いデフォルトテーマの警告を追加
  addOldThemeRecommendations(recommendations, version.themes);

  let vulnerabilityChecks: SecurityVulnerabilityCheck[] = [];
  if (siteRunning && (version.wordpress || version.plugins.length > 0 || version.themes.length > 0)) {
    try {
      vulnerabilityChecks = await fetchVulnerabilityChecks(version);
      addVulnerabilityRecommendations(recommendations, vulnerabilityChecks);
    } catch (err) {
      console.error("WPVulnerability check failed:", err);
    }
  }

  let npmAudit: SecurityNpmAuditResult[] = [];
  try {
    npmAudit = await runNpmAudit(sitePath);
    addNpmAuditRecommendations(recommendations, npmAudit);
  } catch (err) {
    console.error("npm audit failed:", err);
  }

  // wp-config.php チェック（サイト停止中でも実行可能）
  let wpConfigChecks: SecurityWpConfigResult | undefined;
  try {
    wpConfigChecks = await checkWpConfig(sitePath);
    addWpConfigRecommendations(recommendations, wpConfigChecks);
  } catch (err) {
    console.error("wp-config.php check failed:", err);
  }

  // HTTPヘッダ・WordPress露出チェック（サイト稼働中かつURL指定時のみ）
  let securityHeaders: SecurityHeadersResult | undefined;
  let exposureChecks: SecurityExposureResult | undefined;

  if (siteRunning && siteUrl) {
    try {
      const [headersResult, exposureResult] = await Promise.all([
        checkSecurityHeaders(siteUrl),
        checkWordPressExposure(siteUrl),
      ]);
      securityHeaders = headersResult;
      exposureChecks = exposureResult;
      addSecurityHeaderRecommendations(recommendations, headersResult);
      addExposureRecommendations(recommendations, exposureResult);
    } catch (err) {
      console.error("HTTP checks failed:", err);
    }
  } else if (!siteUrl) {
    securityHeaders = {
      checked: false,
      skippedReason: "サイトURLが不明なため、HTTPヘッダチェックをスキップしました",
      headers: [],
    };
    exposureChecks = {
      checked: false,
      skippedReason: "サイトURLが不明なため、露出チェックをスキップしました",
      items: [],
    };
  } else {
    securityHeaders = {
      checked: false,
      skippedReason: "サイトが停止中のため、HTTPヘッダチェックをスキップしました",
      headers: [],
    };
    exposureChecks = {
      checked: false,
      skippedReason: "サイトが停止中のため、露出チェックをスキップしました",
      items: [],
    };
  }

  return {
    scannedAt,
    version,
    fileScan,
    recommendations,
    versionSkippedReason,
    vulnerabilityChecks,
    npmAudit,
    securityHeaders,
    exposureChecks,
    wpConfigChecks,
  };
}
