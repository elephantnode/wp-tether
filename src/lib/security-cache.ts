import fs from "fs/promises";
import path from "path";
import type { SecurityScanResult } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "security-cache");

interface CacheEntry {
  scannedAt: string;
  result: SecurityScanResult;
}

function cachePath(siteId: string): string {
  const safe = siteId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

/**
 * サイトの前回スキャン結果を取得。キャッシュは「再スキャン」するまで有効（時間で失効しない）
 */
export async function getCachedScan(
  siteId: string
): Promise<SecurityScanResult | null> {
  try {
    const filePath = cachePath(siteId);
    const raw = await fs.readFile(filePath, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    return entry.result;
  } catch {
    return null;
  }
}

/**
 * サイトのスキャン結果をキャッシュに保存
 */
export async function setCachedScan(
  siteId: string,
  result: SecurityScanResult
): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const filePath = cachePath(siteId);
    const entry: CacheEntry = { scannedAt: result.scannedAt, result };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
  } catch (err) {
    console.warn("Security scan cache write failed:", err);
  }
}
