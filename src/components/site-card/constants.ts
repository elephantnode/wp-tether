export interface CommandItem {
  label: string;
  cmd: string;
}

export interface CommandGroup {
  category: string;
  items: CommandItem[];
}

export const COMMANDS: CommandGroup[] = [
  {
    category: "WP-CLI",
    items: [
      { label: "プラグイン一覧", cmd: "docker compose run --rm wpcli plugin list" },
      { label: "プラグインインストール", cmd: "docker compose run --rm wpcli plugin install <plugin-name> --activate" },
      { label: "テーマ一覧", cmd: "docker compose run --rm wpcli theme list" },
      { label: "ユーザー一覧", cmd: "docker compose run --rm wpcli user list" },
      { label: "DBエクスポート", cmd: "docker compose run --rm wpcli db export - > backup.sql" },
      { label: "DBインポート", cmd: "docker compose run --rm wpcli db import - < backup.sql" },
      { label: "キャッシュクリア", cmd: "docker compose run --rm wpcli cache flush" },
      { label: "検索置換", cmd: "docker compose run --rm wpcli search-replace 'old' 'new'" },
    ],
  },
  {
    category: "Composer",
    items: [
      { label: "パッケージインストール", cmd: "docker compose run --rm composer require <vendor/package>" },
      { label: "依存関係インストール", cmd: "docker compose run --rm composer install" },
      { label: "依存関係更新", cmd: "docker compose run --rm composer update" },
    ],
  },
  {
    category: "Docker",
    items: [
      { label: "ログ確認", cmd: "docker compose logs -f" },
      { label: "WPログ確認", cmd: "docker compose logs -f wordpress" },
      { label: "コンテナ状態", cmd: "docker compose ps" },
      { label: "再起動", cmd: "docker compose restart" },
    ],
  },
];
