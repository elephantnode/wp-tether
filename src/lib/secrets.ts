import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * 資格情報（DB/FTP パスワード等）を保存時に暗号化するためのユーティリティ。
 *
 * 設計方針:
 * - 鍵はマシンローカル `~/.wp-tether/secret.key` に保存する。
 *   data/ ディレクトリは Dropbox 等で同期され得るため、暗号文と鍵を
 *   同じ場所に置かない（同期されても鍵がなければ復号できない）。
 * - AES-256-GCM。出力は "enc:v1:<iv>:<tag>:<ciphertext>"（base64）。
 * - 既存の平文値との後方互換: 接頭辞 "enc:v1:" を持たない値は平文として扱う。
 */

const ENC_PREFIX = "enc:v1:";
const KEY_DIR = path.join(os.homedir(), ".wp-tether");
const KEY_FILE = path.join(KEY_DIR, "secret.key");

let cachedKey: Buffer | null = null;

/**
 * 暗号鍵を取得（なければ生成して保存）
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  try {
    const existing = fs.readFileSync(KEY_FILE, "utf-8").trim();
    const buf = Buffer.from(existing, "base64");
    if (buf.length === 32) {
      cachedKey = buf;
      return buf;
    }
  } catch {
    // 鍵ファイルがない → 新規生成
  }

  const key = crypto.randomBytes(32);
  fs.mkdirSync(KEY_DIR, { recursive: true });
  // 所有者のみ読み書き可
  fs.writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  try {
    fs.chmodSync(KEY_FILE, 0o600);
  } catch {
    // chmod 不可な環境は無視
  }
  cachedKey = key;
  return key;
}

/** 値が暗号化済みか判定 */
export function isEncrypted(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * 文字列を暗号化。既に暗号化済み・空文字はそのまま返す。
 */
export function encryptSecret(plain: string | undefined | null): string {
  if (!plain) return "";
  if (isEncrypted(plain)) return plain;

  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    ENC_PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":")
  );
}

/**
 * 文字列を復号。暗号化されていない（平文の）値はそのまま返す。
 * 復号に失敗した場合は空文字を返す（鍵不一致など）。
 */
export function decryptSecret(value: string | undefined | null): string {
  if (!value) return "";
  if (!isEncrypted(value)) return value; // 後方互換: 平文

  try {
    const body = value.slice(ENC_PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(":");
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf-8");
  } catch {
    return "";
  }
}
