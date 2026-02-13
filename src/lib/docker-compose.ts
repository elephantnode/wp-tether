import { SiteConfig } from "@/types";

interface GenerateOptions {
  projectName: string;
  port: number;
  config: SiteConfig;
}

/**
 * docker-compose.ymlを生成
 */
export function generateDockerCompose(options: GenerateOptions): string {
  const { projectName, port, config } = options;
  const dbService = config.database.type === "mysql" ? "mysql" : "mariadb";
  const dbImage =
    config.database.type === "mysql"
      ? `mysql:${config.database.version}`
      : `mariadb:${config.database.version}`;

  // MySQL認証プラグイン設定:
  // - MySQL < 8.4: --default-authentication-plugin=mysql_native_password
  // - MySQL 8.4.x: --mysql-native-password=ON
  // - MySQL >= 9.0 (latestを含む): オプション不要（caching_sha2_passwordがデフォルト、WordPressも対応済み）
  // - MariaDB: オプション不要
  const dbVersion = config.database.version;
  const mysqlVersionNum = parseFloat(dbVersion);
  let dbCommand = "";
  if (config.database.type === "mysql") {
    if (dbVersion === "latest" || (!Number.isNaN(mysqlVersionNum) && mysqlVersionNum >= 9.0)) {
      dbCommand = ""; // MySQL 9.x以上はオプション不要
    } else if (!Number.isNaN(mysqlVersionNum) && mysqlVersionNum >= 8.4) {
      dbCommand = "--mysql-native-password=ON"; // MySQL 8.4.x用
    } else {
      dbCommand = "--default-authentication-plugin=mysql_native_password"; // MySQL 8.3以下用
    }
  }

  // WordPressイメージタグの決定
  const wpTag =
    config.wordpress.version === "latest"
      ? config.php.version === "latest"
        ? "latest"
        : `php${config.php.version}-apache`
      : config.php.version === "latest"
        ? config.wordpress.version
        : `${config.wordpress.version}-php${config.php.version}-apache`;

  // localhostモードかカスタムホスト名モードか
  const isLocalhostMode = config.hostnameMode === "localhost";

  // WordPress設定用のPHPコード
  // Docker Composeの環境変数展開を避けるため、$を$$にエスケープ（Composeは$$→$に変換）
  let wpConfigExtra: string;
  if (isLocalhostMode) {
    // localhostモード: ポート番号を保持（http://localhost:8080）
    wpConfigExtra = `$$scheme=(isset($$_SERVER['HTTPS'])&&$$_SERVER['HTTPS']==='on')?'https':'http';$$host=isset($$_SERVER['HTTP_HOST'])?$$_SERVER['HTTP_HOST']:'localhost:${port}';if(!defined('WP_HOME')){define('WP_HOME',$$scheme.'://'.$$host);}if(!defined('WP_SITEURL')){define('WP_SITEURL',$$scheme.'://'.$$host);}`;
  } else {
    // カスタムホスト名モード: リバースプロキシ対応、ポート番号削除
    wpConfigExtra = `if(isset($$_SERVER['HTTP_X_FORWARDED_PROTO'])){$$_SERVER['HTTPS']=($$_SERVER['HTTP_X_FORWARDED_PROTO']==='https')?'on':'off';$$scheme=$$_SERVER['HTTP_X_FORWARDED_PROTO'];}else{$$scheme=(isset($$_SERVER['HTTPS'])&&$$_SERVER['HTTPS']==='on')?'https':'http';}$$host=isset($$_SERVER['HTTP_X_FORWARDED_HOST'])?$$_SERVER['HTTP_X_FORWARDED_HOST']:(isset($$_SERVER['HTTP_HOST'])?$$_SERVER['HTTP_HOST']:'${config.hostname}');$$host=preg_replace('/:\\d+$/','',$$host);if(!defined('WP_HOME')){define('WP_HOME',$$scheme.'://'.$$host);}if(!defined('WP_SITEURL')){define('WP_SITEURL',$$scheme.'://'.$$host);}`;
  }
  // YAMLで環境変数値を二重引用符で囲むため、\" と \\ をエスケープ（単一引用符はそのまま）
  const wpConfigExtraEscaped = wpConfigExtra.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `services:

  ${dbService}:
    container_name: \${PROJECT_NAME}_db
    image: ${dbImage}
${dbCommand ? `    command: '${dbCommand}'` : ""}
    expose:
      - 3306
    volumes:
      - db_data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=\${MYSQL_ROOT_PASSWORD}
      - MYSQL_USER=\${MYSQL_USER}
      - MYSQL_PASSWORD=\${MYSQL_PASSWORD}
      - MYSQL_DATABASE=\${MYSQL_DATABASE}
      - TZ=\${TIMEZONE}
    restart: always
    networks:
      - wp

  wordpress:
    container_name: \${PROJECT_NAME}_wp
    depends_on:
      - ${dbService}
    image: wordpress:${wpTag}
    restart: always
${isLocalhostMode ? `    ports:
      - "${port}:80"` : `    expose:
      - 80`}
    volumes:
      - ./src:/var/www/html
      - ./php/custom.ini:/usr/local/etc/php/conf.d/zzz-custom.ini:ro
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=\${WORDPRESS_DB_USER}
      - WORDPRESS_DB_PASSWORD=\${WORDPRESS_DB_PASSWORD}
      - WORDPRESS_DB_NAME=\${WORDPRESS_DB_NAME}
      - WORDPRESS_DEBUG=\${WORDPRESS_DEBUG}
      - WORDPRESS_SMTP_HOST=mailpit
      - WORDPRESS_SMTP_PORT=1025
      - "WORDPRESS_CONFIG_EXTRA=${wpConfigExtraEscaped}"
      - TZ=\${TIMEZONE}
${config.php.locale ? `      - LANG=${config.php.locale}\n      - LC_ALL=${config.php.locale}` : ""}
    networks:
      - wp

${isLocalhostMode ? "" : `  caddy:
    container_name: \${PROJECT_NAME}_caddy
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./certs:/etc/caddy/certs:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - TZ=\${TIMEZONE}
    depends_on:
      - wordpress
    networks:
      - wp

`}  mailpit:
    container_name: \${PROJECT_NAME}_mailpit
    image: axllent/mailpit
    restart: always
    ports:
      - "${port + 1000}:8025"
    expose:
      - 1025
    environment:
      - TZ=\${TIMEZONE}
    networks:
      - wp

  # WP-CLI + rsync/ssh: docker compose run --rm wpcli <command>
  # 例: docker compose run --rm wpcli plugin list
  # 例: docker compose run --rm wpcli rsync -avz /var/www/html/wp-content/themes/ user@host:/path/
  wpcli:
    container_name: \${PROJECT_NAME}_wpcli
    build:
      context: ./docker/wpcli
      dockerfile: Dockerfile
    depends_on:
      - ${dbService}
      - wordpress
    volumes:
      - ./src:/var/www/html
      - ~/.ssh:/home/www-data/.ssh:ro
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=\${WORDPRESS_DB_USER}
      - WORDPRESS_DB_PASSWORD=\${WORDPRESS_DB_PASSWORD}
      - WORDPRESS_DB_NAME=\${WORDPRESS_DB_NAME}
    networks:
      - wp
    user: "33:33"
    entrypoint: ["wp", "--allow-root"]
    profiles:
      - cli

  # Composer: docker compose run --rm composer <command>
  # 例: docker compose run --rm composer require vendor/package
  composer:
    container_name: \${PROJECT_NAME}_composer
    image: composer:latest
    volumes:
      - ./src:/app
    working_dir: /app
    networks:
      - wp
    profiles:
      - cli

networks:
  wp:
    name: \${PROJECT_NAME}_wp

volumes:
  db_data:${isLocalhostMode ? "" : `
  caddy_data:
  caddy_config:`}
`;
}

export interface CaddyfileOptions extends GenerateOptions {
  /** mkcertで発行した証明書を使う場合 true（ブラウザのSSL警告が出ない） */
  useMkcert?: boolean;
}

/**
 * Caddyfileを生成（ホスト名ベースのルーティング）
 * useMkcert: true のときは certs/cert.pem と certs/key.pem を使用（mkcert 要）
 */
export function generateCaddyfile(options: CaddyfileOptions): string {
  const { config, useMkcert } = options;

  const tlsDirective = useMkcert
    ? `tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem`
    : "tls internal";

  return `{
  local_certs
}

# ${config.hostname} - ポート番号なしでアクセス可能（HTTP/HTTPS自動対応）
${config.hostname} {
  ${tlsDirective}
  reverse_proxy wordpress:80 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
`;
}

/**
 * php.ini 用のカスタム設定を生成（メモリ・実行時間・アップロード・タイムゾーン・文字コードなど）
 * WP関連の重要項目は https://wp-doctor.jp/blog/2023/09/15/php-ini-user-ini/ を参照
 * 起動時に /usr/local/etc/php/conf.d/zzz-custom.ini として読み込まれる
 */
export function generatePhpIni(options: GenerateOptions): string {
  const { config } = options;
  const php = config.php;

  const memoryLimit = php.memoryLimit ?? "300M";
  const maxExecutionTime = php.maxExecutionTime ?? 180;
  const uploadMaxFilesize = php.uploadMaxFilesize ?? "64M";
  const postMaxSize = php.postMaxSize ?? "64M";
  const timezone = config.timezone ?? "Asia/Tokyo";

  return `; wp-tether カスタム php.ini（起動時に自動読み込み）
; 必要に応じて編集してください

[PHP]
memory_limit = ${memoryLimit}
max_execution_time = ${maxExecutionTime}
max_input_time = 120

; アップロード（画像・メディアの上限）
upload_max_filesize = ${uploadMaxFilesize}
post_max_size = ${postMaxSize}

; 日付・タイムゾーン
date.timezone = "${timezone}"

; 文字コード（UTF-8。WordPress標準）
default_charset = "UTF-8"

; 外部URL取得（Off だとテーマ・プラグインの不具合の原因になりやすい）
allow_url_fopen = On

; 一度に受け取れる入力数
max_input_vars = 3000
`;
}

/**
 * .envファイルを生成
 */
export function generateEnvFile(options: GenerateOptions): string {
  const { projectName, config } = options;

  return `# -------------------------------------------
# PROJECT SETTINGS
# -------------------------------------------
PROJECT_NAME=${projectName}
HOSTNAME=${config.hostname}
TIMEZONE=Asia/Tokyo

# -------------------------------------------
# DATABASE
# -------------------------------------------
MYSQL_ROOT_PASSWORD=${config.database.rootPassword}
MYSQL_USER=${config.database.user}
MYSQL_PASSWORD=${config.database.password}
MYSQL_DATABASE=${config.database.name}

# -------------------------------------------
# WORDPRESS
# -------------------------------------------
WORDPRESS_DB_HOST=${config.database.type === "mysql" ? "mysql" : "mariadb"}
WORDPRESS_DB_USER=${config.database.user}
WORDPRESS_DB_PASSWORD=${config.database.password}
WORDPRESS_DB_NAME=${config.database.name}
WORDPRESS_DEBUG=${config.wordpress.debug ? "1" : "0"}

# -------------------------------------------
# SMTP (Mailpit)
# -------------------------------------------
WORDPRESS_SMTP_HOST=mailpit
WORDPRESS_SMTP_PORT=1025
`;
}

/**
 * WP-CLI用Dockerfileを生成（rsync/ssh付き）
 * ファイル同期やリモートサーバーとの連携に使用
 */
export function generateWpcliDockerfile(): string {
  return `# WP-CLI + rsync/ssh
# ファイル同期とリモートサーバー連携用

FROM wordpress:cli

USER root

# rsync と openssh-client をインストール
# wordpress:cli は Alpine ベースのため apk を使用
RUN apk add --no-cache rsync openssh-client

# www-data ユーザーの .ssh ディレクトリを作成
RUN mkdir -p /home/www-data/.ssh && \\
    chown -R www-data:www-data /home/www-data/.ssh && \\
    chmod 700 /home/www-data/.ssh

USER www-data
`;
}
