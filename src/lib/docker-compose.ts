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

  // WordPressイメージタグの決定
  const wpTag =
    config.wordpress.version === "latest"
      ? config.php.version === "latest"
        ? "latest"
        : `php${config.php.version}-apache`
      : config.php.version === "latest"
        ? config.wordpress.version
        : `${config.wordpress.version}-php${config.php.version}-apache`;

  return `services:

  ${dbService}:
    container_name: \${PROJECT_NAME}_db
    image: ${dbImage}
    command: '--default-authentication-plugin=mysql_native_password'
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

  wordpress:
    container_name: \${PROJECT_NAME}_wp
    depends_on:
      - ${dbService}
    image: wordpress:${wpTag}
    restart: always
    expose:
      - 80
    volumes:
      - ./src:/var/www/html
    environment:
      - WORDPRESS_DB_HOST=${dbService}
      - WORDPRESS_DB_USER=\${WORDPRESS_DB_USER}
      - WORDPRESS_DB_PASSWORD=\${WORDPRESS_DB_PASSWORD}
      - WORDPRESS_DB_NAME=\${WORDPRESS_DB_NAME}
      - WORDPRESS_DEBUG=\${WORDPRESS_DEBUG}
      - WORDPRESS_SMTP_HOST=mailpit
      - WORDPRESS_SMTP_PORT=1025
      - TZ=\${TIMEZONE}

  caddy:
    container_name: \${PROJECT_NAME}_caddy
    image: caddy:2-alpine
    restart: always
    ports:
      - ${port}:80
      - ${port + 443 - 80}:443
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - TZ=\${TIMEZONE}
    depends_on:
      - wordpress

  mailpit:
    container_name: \${PROJECT_NAME}_mailpit
    image: axllent/mailpit
    restart: always
    ports:
      - "${port + 1000}:8025"
    expose:
      - 1025
    environment:
      - TZ=\${TIMEZONE}

volumes:
  db_data:
  caddy_data:
  caddy_config:
`;
}

/**
 * Caddyfileを生成
 */
export function generateCaddyfile(options: GenerateOptions): string {
  const { config } = options;

  return `{
  local_certs
}

# デフォルト: localhost:port でアクセス
:80 {
  reverse_proxy wordpress:80
}

# エイリアス: https://${config.hostname} でアクセス（/etc/hostsに追加が必要）
${config.hostname} {
  reverse_proxy wordpress:80
}
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
