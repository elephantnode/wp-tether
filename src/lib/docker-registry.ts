const DOCKER_AUTH_URL = "https://auth.docker.io/token";
const DOCKER_REGISTRY_URL = "https://registry-1.docker.io/v2";

/**
 * Docker Hub認証トークンを取得
 */
async function getAuthToken(image: string): Promise<string> {
  const res = await fetch(
    `${DOCKER_AUTH_URL}?service=registry.docker.io&scope=repository:library/${image}:pull`
  );
  if (!res.ok) {
    throw new Error(`Failed to get auth token: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}

/**
 * Docker Hubからイメージのタグ一覧を取得
 */
export async function getImageTags(image: string): Promise<string[]> {
  const token = await getAuthToken(image);

  const res = await fetch(`${DOCKER_REGISTRY_URL}/library/${image}/tags/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get tags: ${res.status}`);
  }

  const data = await res.json();
  return data.tags || [];
}

/**
 * バージョン番号のみのタグをフィルタ・ソート
 * 例: "6.9.1", "6.9", "10.6" など
 */
function filterVersionTags(tags: string[]): string[] {
  return tags
    .filter((tag) => /^\d+\.\d+(\.\d+)?$/.test(tag))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

/**
 * WordPressの利用可能バージョンを取得
 */
export async function getWordPressVersions(): Promise<string[]> {
  const tags = await getImageTags("wordpress");
  return filterVersionTags(tags);
}

/**
 * MariaDBの利用可能バージョンを取得
 */
export async function getMariaDBVersions(): Promise<string[]> {
  const tags = await getImageTags("mariadb");
  return filterVersionTags(tags);
}

/**
 * MySQLの利用可能バージョンを取得
 */
export async function getMySQLVersions(): Promise<string[]> {
  const tags = await getImageTags("mysql");
  return filterVersionTags(tags);
}

/**
 * PHPの利用可能バージョンを取得
 */
export async function getPHPVersions(): Promise<string[]> {
  const tags = await getImageTags("php");

  // メジャー.マイナー形式のみ抽出（8.2, 8.1など）
  return tags
    .filter((tag) => /^\d+\.\d+$/.test(tag))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
