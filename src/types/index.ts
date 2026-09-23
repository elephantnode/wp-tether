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
    /** マルチサイト設定 */
    multisite?: {
      enabled: boolean;
      type: "subdomain" | "subdirectory";
    };
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
  /** 紐づくローカルサイトID。保守専用の外部サーバーの場合は未設定 */
  siteId?: string;
  name: string; // e.g., "staging", "production"
  type: "ssh" | "sftp" | "ftp";

  /** 保守対象サーバーとして監視・メンテ機能の対象にするか */
  managed?: boolean;
  /** サーバーのグルーピング/環境ラベル（例: "production", "client-a"） */
  tags?: string[];
  /** 監視設定（未設定なら監視しない） */
  monitoring?: MonitoringConfig;

  vhost: string; // e.g., "https://staging.example.com"
  wordpressPath: string; // e.g., "/var/www/html"

  /** デプロイ(DB同期)用の接続情報。保守専用サーバーでは未設定 */
  database?: {
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

  /** HTTP稼働チェック等で使う Basic 認証（サイトに BASIC 認証がかかっている場合） */
  basicAuth?: {
    user: string;
    password: string;
  };

  ftp?: {
    host: string;
    user: string;
    password: string;
    port: number;
    passive: boolean;
  };

  /** rsync除外パターン。保守専用サーバーでは未設定 */
  exclude?: string[];

  /** リモートのWP-CLI設定（検出結果をキャッシュ） */
  wpCli?: {
    available: boolean;
    path?: string; // 例: /usr/local/bin/wp
  };
}

// ===========================================
// サーバー監視・ヘルスチェック
// ===========================================

/** 監視のしきい値設定 */
export interface MonitoringThresholds {
  /** ディスク使用率の警告しきい値（%） */
  diskUsagePercent: number;
  /** SSL証明書 残り日数の警告しきい値（日） */
  sslExpiryDays: number;
  /** HTTP応答時間の警告しきい値（ミリ秒） */
  httpResponseMs: number;
}

/** 監視設定（DeployTarget に紐づく） */
export interface MonitoringConfig {
  enabled: boolean;
  /** チェック間隔（分） */
  intervalMinutes: number;
  thresholds: MonitoringThresholds;
}

export const DEFAULT_MONITORING_THRESHOLDS: MonitoringThresholds = {
  diskUsagePercent: 85,
  sslExpiryDays: 14,
  httpResponseMs: 3000,
};

/** 個別チェックのステータス */
export type HealthStatus = "ok" | "warning" | "critical" | "unknown";

/** HTTP稼働チェック結果 */
export interface HttpCheckResult {
  status: HealthStatus;
  /** HTTPステータスコード */
  statusCode?: number;
  /** 応答時間（ミリ秒） */
  responseMs?: number;
  /** 最終的なURL（リダイレクト後） */
  finalUrl?: string;
  message?: string;
}

/** SSL証明書チェック結果 */
export interface SslCheckResult {
  status: HealthStatus;
  /** 有効期限（ISO 8601） */
  validTo?: string;
  /** 残り日数 */
  daysRemaining?: number;
  /** 発行者 */
  issuer?: string;
  message?: string;
}

/** ディスク使用率チェック結果 */
export interface DiskCheckResult {
  status: HealthStatus;
  /** 使用率（%） */
  usagePercent?: number;
  /** 使用量（人間可読、例: "12G"） */
  used?: string;
  /** 全容量（人間可読） */
  total?: string;
  /** マウントポイント */
  mount?: string;
  message?: string;
}

/** リソース（メモリ/ロード）チェック結果 */
export interface ResourceCheckResult {
  status: HealthStatus;
  /** メモリ使用率（%） */
  memoryUsagePercent?: number;
  /** ロードアベレージ（1分） */
  load1?: number;
  /** CPUコア数 */
  cpuCores?: number;
  message?: string;
}

/** WordPress ヘルス/更新チェック結果 */
export interface WpHealthCheckResult {
  status: HealthStatus;
  /** WordPress コアバージョン */
  coreVersion?: string;
  /** コア更新が利用可能か */
  coreUpdateAvailable?: boolean;
  /** 更新可能なプラグイン数 */
  pluginUpdates?: number;
  /** 更新可能なテーマ数 */
  themeUpdates?: number;
  /** 期限超過の cron イベント数 */
  overdueCron?: number;
  /** 結果には影響しない PHP 警告（wp-config.php の重複 define など）。先頭数件のみ */
  notices?: string[];
  /** PHP 警告の総数（notices は上限で切られている） */
  noticeCount?: number;
  message?: string;
}

/** 1サーバーのヘルスチェック総合結果 */
export interface ServerHealthResult {
  targetId: string;
  /** チェック実行日時（ISO 8601） */
  checkedAt: string;
  /** 全チェックを総合したステータス */
  overall: HealthStatus;
  http: HttpCheckResult;
  ssl: SslCheckResult;
  disk: DiskCheckResult;
  resource: ResourceCheckResult;
  wp: WpHealthCheckResult;
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

// ===========================================
// リモートサーバー向けセキュリティチェック
// ===========================================

/** WP-CLI verify-checksums の結果（コア/プラグイン） */
export interface ChecksumVerifyResult {
  /** チェックが実行されたか */
  checked: boolean;
  /** 未実行理由 */
  skippedReason?: string;
  /** 改ざん/不一致が検出されたか */
  hasMismatch: boolean;
  /** 不一致の詳細（ファイルパスやプラグイン名） */
  mismatches: string[];
}

/** ファイル権限監査の結果 */
export interface FilePermissionAuditResult {
  /** チェックが実行されたか */
  checked: boolean;
  /** 未実行理由 */
  skippedReason?: string;
  /** wp-config.php の権限（例: "640"） */
  wpConfigPerms?: string;
  /** wp-config.php の権限が緩すぎるか（group/other に書き込み or other に読み取り可） */
  wpConfigTooOpen?: boolean;
  /** 誰でも書き込み可能なファイル数（wp-content 配下） */
  worldWritableCount?: number;
  /** 代表的な world-writable ファイル（最大20件） */
  worldWritableSamples: string[];
}

// ===========================================
// ローカルバックアップ（ファイル + DB を管理者ローカルへ世代保存）
// ===========================================

/** バックアップ対象のファイルスコープ */
export type BackupFileScope = "uploads" | "plugins" | "themes" | "languages";

/** バックアップ取得オプション */
export interface LocalBackupOptions {
  /** 取得するファイルスコープ */
  fileScopes: BackupFileScope[];
  /** wp-config.php を含めるか */
  includeWpConfig: boolean;
  /** DB を含めるか */
  includeDb: boolean;
  /** DB のユーザーテーブルを除外するか */
  excludeUsers?: boolean;
}

/** 1世代分のバックアップ情報（manifest.json と一致） */
export interface BackupGeneration {
  /** 世代ID（タイムスタンプ: YYYYMMDD_HHMMSS） */
  id: string;
  createdAt: string;
  targetId: string;
  targetName: string;
  fileScopes: BackupFileScope[];
  hasWpConfig: boolean;
  hasDb: boolean;
  /** 合計サイズ（バイト） */
  totalBytes: number;
  /** 構成要素ごとのサイズ */
  sizes: Record<string, number>;
}

/** バックアップ実行結果 */
export interface LocalBackupResult {
  success: boolean;
  generation?: BackupGeneration;
  output: string;
  error?: string;
}

/** 復元オプション */
export interface BackupRestoreOptions {
  generationId: string;
  /** 復元するファイルスコープ */
  fileScopes: BackupFileScope[];
  /** DB を復元するか */
  restoreDb: boolean;
  /** ファイル復元モード（mirror=削除含む / additive=追加更新のみ） */
  mode: SyncMode;
}

// ===========================================
// リモートメンテナンス（更新・WP-CLI）
// ===========================================

/** 更新可能な1項目 */
export interface UpdateItem {
  type: "core" | "plugin" | "theme";
  name: string;
  currentVersion?: string;
  newVersion?: string;
}

/** 更新プレビュー結果 */
/** コア更新の候補（wp core check-update の1行） */
export interface CoreUpdateCandidate {
  version: string;
  /** "major" | "minor"（WP-CLIの update_type をそのまま保持） */
  updateType: string;
}

export interface UpdatePreview {
  coreUpdate?: {
    current: string;
    latest: string;
    /** 利用可能な全候補（マイナー/メジャーが同時に出ることがある） */
    candidates: CoreUpdateCandidate[];
  };
  plugins: UpdateItem[];
  themes: UpdateItem[];
  translations: number;
}

/** コア更新をどこまで上げるか */
export interface CoreUpdateOption {
  /** 指定バージョンへ更新（未指定なら minorOnly に従う） */
  version?: string;
  /** true なら wp core update --minor（マイナーに留める） */
  minorOnly?: boolean;
}

/** メンテナンス操作の種別 */
export type MaintenanceAction =
  | "update-core"
  | "update-plugins"
  | "update-themes"
  | "update-translations"
  | "update-all";

/** メンテナンス実行結果 */
export interface MaintenanceResult {
  success: boolean;
  backupPath?: string;
  output: string;
  error?: string;
}

// ===========================================
// リモートログ・cron
// ===========================================

/** 取得可能なログ種別 */
export type RemoteLogType = "debug" | "php-error";

/** リモートログ取得結果 */
export interface RemoteLogResult {
  type: RemoteLogType;
  /** ログファイルのパス（解決できた場合） */
  path?: string;
  /** ログ本文（tail） */
  content: string;
  /** ログが見つからない等の理由 */
  message?: string;
}

/** WP-Cron イベント1件 */
export interface CronEvent {
  hook: string;
  /** 次回実行（相対表現、例: "5 mins"） */
  nextRunRelative?: string;
  /** 次回実行（GMT文字列） */
  nextRunGmt?: string;
  /** 期限超過か */
  overdue: boolean;
  schedule?: string;
}

/** cron 一覧結果 */
export interface CronListResult {
  events: CronEvent[];
  overdueCount: number;
}

/** リモートサーバーのセキュリティスキャン総合結果 */
export interface RemoteSecurityScanResult {
  targetId: string;
  scannedAt: string;
  version: SecurityVersionInfo;
  versionSkippedReason?: string;
  vulnerabilityChecks: SecurityVulnerabilityCheck[];
  fileScan: SecurityFileScanResult;
  coreChecksum: ChecksumVerifyResult;
  pluginChecksum: ChecksumVerifyResult;
  filePermissions: FilePermissionAuditResult;
  securityHeaders?: SecurityHeadersResult;
  exposureChecks?: SecurityExposureResult;
  wpConfigChecks?: SecurityWpConfigResult;
  recommendations: SecurityRecommendation[];
}
