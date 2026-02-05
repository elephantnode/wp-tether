import { NextRequest, NextResponse } from "next/server";
import {
  getWordPressVersions,
  getMariaDBVersions,
  getMySQLVersions,
  getPHPVersions,
  getImageTags,
} from "@/lib/docker-registry";

// フォールバック用のバージョン
const FALLBACK_VERSIONS = {
  wordpress: ["6.9", "6.8", "6.7", "6.6", "6.5"],
  mariadb: ["11.4", "10.11", "10.6", "10.5"],
  mysql: ["8.4", "8.0", "5.7"],
  php: ["8.3", "8.2", "8.1", "8.0"],
};

type ImageType = keyof typeof FALLBACK_VERSIONS;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const image = searchParams.get("image") as ImageType | null;

  if (!image) {
    // 全イメージのバージョンを取得
    try {
      const [wordpress, mariadb, mysql, php] = await Promise.all([
        getWordPressVersions().catch(() => FALLBACK_VERSIONS.wordpress),
        getMariaDBVersions().catch(() => FALLBACK_VERSIONS.mariadb),
        getMySQLVersions().catch(() => FALLBACK_VERSIONS.mysql),
        getPHPVersions().catch(() => FALLBACK_VERSIONS.php),
      ]);

      return NextResponse.json({
        wordpress: ["latest", ...wordpress.slice(0, 10)],
        mariadb: ["latest", ...mariadb.slice(0, 10)],
        mysql: ["latest", ...mysql.slice(0, 10)],
        php: ["latest", ...php.slice(0, 10)],
      });
    } catch (error) {
      console.error("Failed to fetch versions:", error);
      return NextResponse.json({
        wordpress: ["latest", ...FALLBACK_VERSIONS.wordpress],
        mariadb: ["latest", ...FALLBACK_VERSIONS.mariadb],
        mysql: ["latest", ...FALLBACK_VERSIONS.mysql],
        php: ["latest", ...FALLBACK_VERSIONS.php],
      });
    }
  }

  // 特定のイメージのバージョンを取得
  try {
    let versions: string[];

    switch (image) {
      case "wordpress":
        versions = await getWordPressVersions();
        versions = ["latest", ...versions.slice(0, 20)];
        break;
      case "mariadb":
        versions = await getMariaDBVersions();
        versions = ["latest", ...versions.slice(0, 20)];
        break;
      case "mysql":
        versions = await getMySQLVersions();
        versions = ["latest", ...versions.slice(0, 20)];
        break;
      case "php":
        versions = await getPHPVersions();
        versions = ["latest", ...versions.slice(0, 10)];
        break;
      default:
        // 任意のイメージ名
        const tags = await getImageTags(image);
        versions = tags
          .filter((tag) => /^\d+\.\d+(\.\d+)?$/.test(tag))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .slice(0, 20);
        versions = ["latest", ...versions];
    }

    return NextResponse.json({ versions });
  } catch (error) {
    console.error(`Failed to fetch ${image} versions:`, error);

    // フォールバック
    const fallback = FALLBACK_VERSIONS[image] || [];
    return NextResponse.json({
      versions: ["latest", ...fallback],
      fallback: true,
    });
  }
}
