import {
  DeployTarget,
  UpdatePreview,
  UpdateItem,
  CoreUpdateCandidate,
  CoreUpdateOption,
  MaintenanceAction,
  MaintenanceResult,
} from "@/types";
import { executeRemoteCommand, shellEscape } from "./remote-exec";

/** リモート WP-CLI を実行（cd <wpPath> && wp ...） */
async function wp(
  target: DeployTarget,
  args: string,
  timeoutMs = 120000
): Promise<{ stdout: string; stderr: string }> {
  const wpBin = target.wpCli?.path || "wp";
  return executeRemoteCommand(target, `cd ${shellEscape(target.wordpressPath)} && ${wpBin} ${args}`, timeoutMs);
}

function ensureWpCli(target: DeployTarget): void {
  if (target.wpCli?.available === false) {
    throw new Error("リモートに WP-CLI がないため、メンテナンス操作を実行できません");
  }
}

/** execFile 失敗時に乗ってくる出力フィールド */
interface ExecErrorLike {
  stdout?: string;
  stderr?: string;
  message?: string;
  code?: number;
}

/**
 * wp を実行し、非ゼロ終了（失敗）時も実際の出力を取得して返す。
 * execFile は非ゼロ終了で例外を投げるが、その例外の stdout/stderr に
 * WP-CLI の本当のエラー文が入っているため、それを拾って表示する。
 */
async function runWp(
  target: DeployTarget,
  args: string,
  timeoutMs = 120000
): Promise<{ output: string; ok: boolean }> {
  try {
    const { stdout, stderr } = await wp(target, args, timeoutMs);
    return { output: (stdout + stderr).trim(), ok: true };
  } catch (e) {
    const err = e as ExecErrorLike;
    const out = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
    return { output: out || err.message || "コマンドが失敗しました", ok: false };
  }
}

// ===========================================
// WP-CLI バッチ実行（1本の SSH で複数コマンドを順に流す）
// ===========================================
/**
 * セクション区切りマーカー。WP-CLI の出力に現れない文字列にしている。
 */
const SECTION_MARKER = "___WP_TETHER_SECTION___";

/**
 * バッチのタイムアウト（5分）。
 * 個別 SSH（120s）より長いのは、コマンドを並列ではなく直列に流すため。
 */
const BATCH_TIMEOUT_MS = 300000;

interface BatchStep {
  /** 結果を引くためのキー */
  key: string;
  /** wp に渡す引数 */
  args: string;
  /** コマンドが失敗したときに代わりに出力する値 */
  fallback: string;
}

/**
 * 複数の WP-CLI コマンドを **1本の SSH セッション** で順に実行する。
 *
 * 以前は Promise.all で 1 コマンド 1 SSH を並列に張っていたが、
 * リモート側で WordPress のブートが同時に何本も走って CPU を奪い合い、
 * 単発なら数秒のコマンドが数分に膨れてタイムアウトしていた。
 * SSH ハンドシェイクのコストも接続数分かかっていた。
 */
async function runWpBatch(
  target: DeployTarget,
  steps: BatchStep[],
  timeoutMs: number = BATCH_TIMEOUT_MS
): Promise<Record<string, string>> {
  const wpBin = target.wpCli?.path || "wp";
  // cd 失敗時に後続の wp がホームディレクトリで走らないよう、ここで打ち切る
  const script =
    `cd ${shellEscape(target.wordpressPath)} || exit 1; ` +
    steps
      .map(
        (s) =>
          // 直前のコマンドが改行なしで終わっても（例: `--format=json` は
          // 末尾に改行を付けない）マーカーが必ず行頭に来るよう改行で挟む
          `printf '\\n%s\\n' ${shellEscape(SECTION_MARKER + s.key)}; ` +
          // 各ステップを必ず終了コード 0 で終わらせ、1つの失敗で
          // 連鎖全体が落ちて取得済みの結果まで捨てられるのを防ぐ
          `${wpBin} ${s.args} 2>/dev/null || printf '%s\\n' ${shellEscape(s.fallback)}`
      )
      .join("; ");

  let stdout = "";
  try {
    ({ stdout } = await executeRemoteCommand(target, script, timeoutMs));
  } catch (e) {
    // タイムアウト／非ゼロ終了でも、そこまでに得られた出力は使う。
    // （途中で切れた場合、未到達のセクションは空文字のままになる）
    stdout = (e as ExecErrorLike).stdout ?? "";
  }

  const sections: Record<string, string> = {};
  for (const s of steps) sections[s.key] = "";

  let current: string | null = null;
  const lines: Record<string, string[]> = {};
  for (const line of stdout.split("\n")) {
    if (line.startsWith(SECTION_MARKER)) {
      current = line.slice(SECTION_MARKER.length).trim();
      lines[current] = [];
      continue;
    }
    if (current && lines[current]) lines[current].push(line);
  }
  for (const [key, body] of Object.entries(lines)) {
    if (key in sections) sections[key] = body.join("\n").trim();
  }

  return sections;
}

// ===========================================
// 更新プレビュー
// ===========================================
const PREVIEW_STEPS: BatchStep[] = [
  { key: "coreUpdate", args: "core check-update --format=json", fallback: "[]" },
  { key: "coreVersion", args: "core version", fallback: "" },
  {
    key: "plugins",
    args: "plugin list --update=available --format=json --fields=name,version,update_version",
    fallback: "[]",
  },
  {
    key: "themes",
    args: "theme list --update=available --format=json --fields=name,version,update_version",
    fallback: "[]",
  },
  { key: "translations", args: "language core list --update=available --format=count", fallback: "0" },
  { key: "maintenanceMode", args: "maintenance-mode status", fallback: "" },
];

export interface MaintenanceOverview {
  preview: UpdatePreview;
  maintenanceMode: boolean;
}

/**
 * 更新プレビューとメンテナンスモード状態をまとめて取得する。
 * 6 コマンドすべてを 1 本の SSH で流すので、接続は 1 回で済む。
 */
export async function getMaintenanceOverview(target: DeployTarget): Promise<MaintenanceOverview> {
  ensureWpCli(target);
  const sections = await runWpBatch(target, PREVIEW_STEPS);

  return {
    preview: buildPreview(sections),
    maintenanceMode:
      /active/i.test(sections.maintenanceMode) && !/not active/i.test(sections.maintenanceMode),
  };
}

function buildPreview(sections: Record<string, string>): UpdatePreview {
  const preview: UpdatePreview = { plugins: [], themes: [], translations: 0 };

  try {
    // check-update が返すのは version / update_type / package_url のみ。
    // 現在バージョンは含まれないので wp core version から取る。
    const current = sections.coreVersion || "";
    const core = JSON.parse(sections.coreUpdate || "[]") as {
      version: string;
      update_type?: string;
    }[];
    if (core.length > 0) {
      const candidates: CoreUpdateCandidate[] = core
        .filter((c) => c.version)
        .map((c) => ({ version: c.version, updateType: c.update_type || "" }));
      preview.coreUpdate = {
        current,
        // 最新＝バージョン番号が最大のもの（WP-CLIの並び順に依存しない）
        latest: candidates.reduce((a, b) => (compareVersions(b.version, a.version) > 0 ? b : a))
          .version,
        candidates,
      };
    }
  } catch {
    /* ignore */
  }

  preview.plugins = parseUpdateList(sections.plugins, "plugin");
  preview.themes = parseUpdateList(sections.themes, "theme");

  const transCount = parseInt(sections.translations, 10);
  preview.translations = isNaN(transCount) ? 0 : transCount;

  return preview;
}

/** "6.8.10" > "6.8.2" を正しく判定する数値比較 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function parseUpdateList(json: string, type: "plugin" | "theme"): UpdateItem[] {
  try {
    const list = JSON.parse(json || "[]") as { name: string; version: string; update_version?: string }[];
    return list.map((i) => ({
      type,
      name: i.name,
      currentVersion: i.version,
      newVersion: i.update_version,
    }));
  } catch {
    return [];
  }
}

// ===========================================
// 事前バックアップ（リモート DB エクスポート）
// ===========================================
async function backupBeforeUpdate(target: DeployTarget, log: string[]): Promise<string | undefined> {
  try {
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const safeName = target.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const { stdout: home } = await executeRemoteCommand(target, "echo $HOME");
    const backupDir = `${home.trim()}/wp-tether-maintenance-backups/${safeName}`;
    const backupPath = `${backupDir}/db_${timestamp}.sql`;

    await executeRemoteCommand(target, `mkdir -p ${shellEscape(backupDir)}`);
    await wp(target, `db export ${shellEscape(backupPath)}`, 300000);
    log.push(`DBバックアップ作成: ${backupPath}`);
    return backupPath;
  } catch (error) {
    log.push(`[警告] バックアップに失敗: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

// ===========================================
// 更新実行（事前バックアップ付き）
// ===========================================
export async function runUpdate(
  target: DeployTarget,
  action: MaintenanceAction,
  createBackup: boolean,
  coreOption?: CoreUpdateOption
): Promise<MaintenanceResult> {
  ensureWpCli(target);
  const log: string[] = [];
  let backupPath: string | undefined;

  try {
    if (createBackup) {
      log.push("=== 事前バックアップ ===");
      backupPath = await backupBeforeUpdate(target, log);
    }

    log.push("\n=== 更新実行 ===");
    const commands = updateCommands(action, coreOption);
    for (const cmd of commands) {
      log.push(`\n$ wp ${cmd}`);
      const { output, ok } = await runWp(target, `${cmd} 2>&1`, 600000);
      log.push(output || "(出力なし)");
      if (!ok) {
        log.push(`\n[エラー] 「wp ${cmd}」が失敗しました。上記の出力を確認してください。`);
        return {
          success: false,
          backupPath,
          output: log.join("\n"),
          error: `wp ${cmd} が失敗しました`,
        };
      }
    }

    // 更新後にコア整合性を検証
    log.push("\n=== 整合性検証 ===");
    const verify = await runWp(target, "core verify-checksums 2>&1 || true", 120000);
    log.push(verify.output.trim() || "(出力なし)");

    log.push("\n=== 完了 ===");
    return { success: true, backupPath, output: log.join("\n") };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.push(`\n[エラー] ${msg}`);
    return { success: false, backupPath, output: log.join("\n"), error: msg };
  }
}

/**
 * コア更新コマンドを組み立てる。
 * - version 指定があれば --version=X（狙ったバージョンに固定）
 * - minorOnly なら --minor（マイナーに留める）
 * - どちらも無ければ最新（＝メジャーがあればメジャー）
 */
function coreUpdateCommand(option?: CoreUpdateOption): string {
  if (option?.version) {
    // バージョン番号の形だけを許可（shellEscape に加えた二重の防御）
    if (!/^\d+(\.\d+){0,3}$/.test(option.version)) {
      throw new Error(`不正なバージョン指定です: ${option.version}`);
    }
    return `core update --version=${shellEscape(option.version)}`;
  }
  if (option?.minorOnly) {
    return "core update --minor";
  }
  return "core update";
}

function updateCommands(action: MaintenanceAction, coreOption?: CoreUpdateOption): string[] {
  switch (action) {
    case "update-core":
      return [coreUpdateCommand(coreOption), "core update-db"];
    case "update-plugins":
      return ["plugin update --all"];
    case "update-themes":
      return ["theme update --all"];
    case "update-translations":
      return ["language core update", "language plugin update --all", "language theme update --all"];
    case "update-all":
      // 一括実行ではコアは常にマイナーに留める（coreOption では上書きさせない）。
      // メジャー更新は「メジャー更新」ボタンからの意図的な操作を要求する。
      return [
        coreUpdateCommand({ minorOnly: true }),
        "core update-db",
        "plugin update --all",
        "theme update --all",
        "language core update",
      ];
    default:
      return [];
  }
}

// ===========================================
// メンテナンスモード
// ===========================================
export async function setMaintenanceMode(
  target: DeployTarget,
  active: boolean
): Promise<MaintenanceResult> {
  ensureWpCli(target);
  const { output, ok } = await runWp(
    target,
    `maintenance-mode ${active ? "activate" : "deactivate"} 2>&1`,
    30000
  );
  return { success: ok, output, error: ok ? undefined : output };
}

// ===========================================
// 任意 WP-CLI コマンド実行
// ===========================================
/** 破壊的・危険なコマンドはブロック（誤操作防止） */
const BLOCKED_WP_SUBCOMMANDS = [/^db\s+drop/i, /^db\s+reset/i, /^site\s+empty/i];

export async function runWpCliCommand(
  target: DeployTarget,
  command: string
): Promise<MaintenanceResult> {
  ensureWpCli(target);

  // 先頭の "wp" は除去して受け付ける
  const normalized = command.trim().replace(/^wp\s+/, "");
  if (!normalized) {
    return { success: false, output: "", error: "コマンドが空です" };
  }
  for (const blocked of BLOCKED_WP_SUBCOMMANDS) {
    if (blocked.test(normalized)) {
      return { success: false, output: "", error: "このコマンドは安全のためブロックされています" };
    }
  }

  const { output, ok } = await runWp(target, `${normalized} 2>&1`, 300000);
  return { success: ok, output, error: ok ? undefined : output };
}
