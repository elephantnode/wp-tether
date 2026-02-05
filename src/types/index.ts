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
  suffix: string;
  timezone: string;
  certName?: string;
  port: number;

  wordpress: {
    version: string; // e.g., "latest", "6.4", "6.3.2"
    debug: boolean;
  };

  php: {
    version: string; // e.g., "8.2", "8.1", "7.4"
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
