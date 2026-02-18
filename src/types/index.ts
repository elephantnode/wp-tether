// ===========================================
// サイト（プロジェクト）
// ===========================================
export interface Site {
  id: string;
  name: string;
  path: string; // docker-compose.ymlがあるディレクトリ
  config: SiteConfig;
  status: "running" | "stopped" | "creating" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface SiteConfig {
  projectName: string;
  hostname: string;
  /** ホスト名モード: custom = カスタムホスト名（要/etc/hosts）, localhost = localhost:port */
  hostnameMode: "custom" | "localhost";
  suffix: string;
  timezone: string;
  certName?: string;
  port: number;

  wordpress: {
    version: string; // e.g., "latest", "6.4", "6.3.2"
    debug: boolean;
    /** 初期インストール設定（オプション） */
    admin?: {
      user: string;
      password: string;
      email: string;
    };
    /** WordPress言語（例: ja, en_US） */
    locale?: string;
  };

  php: {
    version: string; // e.g., "8.2", "8.1", "7.4"
    /** php.ini 用（未指定時はデフォルト値を使用） */
    memoryLimit?: string;
    maxExecutionTime?: number;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    /** ロケール（例: ja_JP.UTF-8）。コンテナの LANG/LC_ALL にも反映 */
    locale?: string;
  };

  database: {
    type: "mariadb" | "mysql";
    version: string; // e.g., "10.6", "8.0"
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
}

// ===========================================
// デプロイ先（Wordmove代替）
// ===========================================
export interface DeployTarget {
  id: string;
  siteId: string;
  name: string; // e.g., "staging", "production"
  type: "ssh" | "sftp" | "ftp";

  vhost: string; // e.g., "https://staging.example.com"
  wordpressPath: string; // e.g., "/var/www/html"

  database: {
    name: string;
    user: string;
    password: string;
    host: string;
    charset?: string;
  };

  ssh?: {
    host: string;
    user: string;
    port: number;
    keyPath?: string;
  };

  ftp?: {
    host: string;
    user: string;
    password: string;
    port: number;
    passive: boolean;
  };

  exclude: string[]; // rsync除外パターン

  /** リモートのWP-CLI設定（検出結果をキャッシュ） */
  wpCli?: {
    available: boolean;
    path?: string; // 例: /usr/local/bin/wp
  };
}

// ===========================================
// DB同期
// ===========================================

/** DB同期オプション */
export interface DbSyncOptions {
  direction: "push" | "pull";
  includeUsers: boolean; // wp_users, wp_usermeta を含むか
  createBackup: boolean; // インポート前にバックアップを取るか
  dryRun?: boolean; // プレビューのみ（実行しない）
}

/** DB同期結果 */
export interface DbSyncResult {
  success: boolean;
  backupPath?: string; // 作成したバックアップのパス
  tablesAffected?: number;
  rowsAffected?: number;
  searchReplaceLog?: string;
  output?: string;
  error?: string;
}

/** リモートサーバーのDB操作能力 */
export interface RemoteDbCapabilities {
  hasWpCli: boolean;
  wpCliPath?: string;
  hasMysqldump: boolean;
  hasMariadbDump: boolean;
  dbType: "mysql" | "mariadb" | "unknown";
}

// ===========================================
// デプロイ操作
// ===========================================
export type DeployDirection = "push" | "pull";

export type DeployScope =
  | "all"
  | "db"
  | "themes"
  | "plugins"
  | "uploads"
  | "mu-plugins"
  | "languages";

/**
 * 同期モード
 * - mirror: 完全同期（削除も含む）
 * - additive: 追加・更新のみ（削除しない）
 * - update: 新しいファイルのみ（宛先が新しければスキップ）
 */
export type SyncMode = "mirror" | "additive" | "update";

export interface DeployTask {
  id: string;
  siteId: string;
  targetId: string;
  direction: DeployDirection;
  scope: DeployScope[];
  status: "pending" | "running" | "completed" | "failed";
  log: string[];
  startedAt?: string;
  completedAt?: string;
}

// ===========================================
// コンテナ情報
// ===========================================
export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "created";
  ports: PortMapping[];
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: "tcp" | "udp";
}

// ===========================================
// トンネル（外部公開）
// ===========================================
export interface Tunnel {
  id: string;
  siteId: string;
  type: "ngrok" | "cloudflare";
  localPort: number;
  publicUrl?: string;
  status: "connecting" | "connected" | "disconnected" | "error";
}

// ===========================================
// セキュリティスキャン
// ===========================================

export interface SecurityVersionInfo {
  /** WordPress コアバージョン（取得失敗時は undefined） */
  wordpress?: string;
  /** PHP バージョン（実行時、取得失敗時は undefined） */
  php?: string;
  /** プラグイン一覧（name, version, status） */
  plugins: { name: string; version: string; status: "active" | "inactive" }[];
  /** テーマ一覧（name, version, status） */
  themes: { name: string; version: string; status: "active" | "inactive" }[];
}

export interface SecurityFileScanIssue {
  path: string; // サイトルートからの相対パス
  line?: number;
  pattern: string; // 検出したパターン名
  snippet?: string; // 該当行の抜粋（最大100文字程度）
}

export interface SecurityFileScanResult {
  scannedDirs: string[];
  filesScanned: number;
  issues: SecurityFileScanIssue[];
}

export interface SecurityRecommendation {
  id: string;
  level: "warning" | "info";
  title: string;
  message: string;
  /** 対応例（例: プラグイン名のリスト） */
  detail?: string[];
}

/** WPVulnerability で検出した1件の脆弱性（表示用） */
export interface SecurityVulnerabilityItem {
  /** 脆弱性の概要（例: CVE-2024-1234） */
  name: string;
  /** 詳細説明（短い一文） */
  description?: string;
  /** 情報元リンク */
  link?: string;
  /** CVSS 深刻度 (critical, high, medium, low など) */
  severity?: string;
  /** 影響バージョン範囲の説明（例: "&lt; 3.1.5"） */
  affectedVersion?: string;
}

/** 1製品（コア/プラグイン/テーマ）の脆弱性チェック結果 */
export interface SecurityVulnerabilityCheck {
  type: "core" | "plugin" | "theme";
  name: string; // 表示名（プラグイン/テーマ名または "WordPress"）
  slug?: string; // プラグイン/テーマのスラッグ
  installedVersion: string;
  vulnerabilities: SecurityVulnerabilityItem[];
}

export interface SecurityScanResult {
  scannedAt: string; // ISO 8601
  version: SecurityVersionInfo;
  fileScan: SecurityFileScanResult;
  recommendations: SecurityRecommendation[];
  /** バージョン取得がスキップされた理由（サイト停止中など） */
  versionSkippedReason?: string;
  /** WPVulnerability API による脆弱性チェック結果（取得失敗時は空配列） */
  vulnerabilityChecks: SecurityVulnerabilityCheck[];
  /** npm audit 結果（package.json があるディレクトリのみ。キャッシュ互換のため省略可） */
  npmAudit?: SecurityNpmAuditResult[];
  /** HTTPセキュリティヘッダのチェック結果 */
  securityHeaders?: SecurityHeadersResult;
  /** WordPress露出チェック結果 */
  exposureChecks?: SecurityExposureResult;
  /** wp-config.php 設定チェック結果 */
  wpConfigChecks?: SecurityWpConfigResult;
}

/** npm audit の1プロジェクト分の結果 */
export interface SecurityNpmAuditResult {
  /** サイトの wp-content からの相対パス（例: plugins/my-plugin, themes/my-theme） */
  projectPath: string;
  /** 実行エラー時はメッセージ（脆弱性カウントは 0） */
  error?: string;
  /** 深刻度別件数 */
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
  };
}

// ===========================================
// セキュリティヘッダ・WordPress設定チェック
// ===========================================

/** HTTPセキュリティヘッダのチェック結果 */
export interface SecurityHeaderCheck {
  /** ヘッダ名 */
  name: string;
  /** 検出された値（未設定の場合は undefined） */
  value?: string;
  /** ヘッダが設定されているか */
  present: boolean;
  /** 推奨される設定 */
  recommended: string;
  /** 説明 */
  description: string;
}

/** HTTPセキュリティヘッダの総合結果 */
export interface SecurityHeadersResult {
  /** チェックが実行されたか（サイト停止中は false） */
  checked: boolean;
  /** 未実行理由 */
  skippedReason?: string;
  /** 各ヘッダのチェック結果 */
  headers: SecurityHeaderCheck[];
}

/** WordPress露出チェックの1項目 */
export interface SecurityExposureItem {
  /** チェック項目ID */
  id: string;
  /** 項目名 */
  name: string;
  /** チェックしたURL/パス */
  path: string;
  /** 露出しているか（true = リスクあり） */
  exposed: boolean;
  /** 取得した情報（バージョン、ユーザー名など） */
  detail?: string;
  /** リスク説明 */
  risk: string;
  /** 対策 */
  mitigation: string;
}

/** WordPress露出チェックの総合結果 */
export interface SecurityExposureResult {
  /** チェックが実行されたか */
  checked: boolean;
  /** 未実行理由 */
  skippedReason?: string;
  /** 各項目のチェック結果 */
  items: SecurityExposureItem[];
}

/** wp-config.php のセキュリティ設定チェック */
export interface SecurityWpConfigCheck {
  /** チェック項目ID */
  id: string;
  /** 項目名 */
  name: string;
  /** 現在の設定値 */
  currentValue?: string;
  /** 推奨値 */
  recommendedValue: string;
  /** 問題があるか */
  hasIssue: boolean;
  /** 説明 */
  description: string;
}

/** wp-config.php チェック結果 */
export interface SecurityWpConfigResult {
  /** チェックが実行されたか */
  checked: boolean;
  /** 未実行理由 */
  skippedReason?: string;
  /** 各設定のチェック結果 */
  items: SecurityWpConfigCheck[];
}
