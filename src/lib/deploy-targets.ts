import fs from "fs/promises";
import path from "path";
import { DeployTarget } from "@/types";
import { resolveDeployTargetsJsonPath } from "./app-config";
import { encryptSecret, decryptSecret } from "./secrets";

interface DeployTargetsData {
  targets: DeployTarget[];
}

/**
 * 保存用に資格情報を暗号化したコピーを返す
 */
function encryptTargetSecrets(target: DeployTarget): DeployTarget {
  const copy: DeployTarget = {
    ...target,
    database: { ...target.database, password: encryptSecret(target.database.password) },
  };
  if (target.ftp) {
    copy.ftp = { ...target.ftp, password: encryptSecret(target.ftp.password) };
  }
  if (target.basicAuth) {
    copy.basicAuth = { ...target.basicAuth, password: encryptSecret(target.basicAuth.password) };
  }
  return copy;
}

/**
 * 読み込み用に資格情報を復号したコピーを返す（平文値はそのまま）
 */
function decryptTargetSecrets(target: DeployTarget): DeployTarget {
  const copy: DeployTarget = {
    ...target,
    database: { ...target.database, password: decryptSecret(target.database.password) },
  };
  if (target.ftp) {
    copy.ftp = { ...target.ftp, password: decryptSecret(target.ftp.password) };
  }
  if (target.basicAuth) {
    copy.basicAuth = { ...target.basicAuth, password: decryptSecret(target.basicAuth.password) };
  }
  return copy;
}

/**
 * デプロイターゲット一覧を取得（資格情報は復号済み）
 */
export async function getDeployTargets(siteId?: string): Promise<DeployTarget[]> {
  try {
    const file = await resolveDeployTargetsJsonPath();
    const content = await fs.readFile(file, "utf-8");
    const data: DeployTargetsData = JSON.parse(content);
    const targets = data.targets.map(decryptTargetSecrets);
    if (siteId) {
      return targets.filter((t) => t.siteId === siteId);
    }
    return targets;
  } catch {
    return [];
  }
}

/**
 * デプロイターゲットを保存（資格情報は暗号化して保存）
 */
export async function saveDeployTargets(targets: DeployTarget[]): Promise<void> {
  const file = await resolveDeployTargetsJsonPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const encrypted = targets.map(encryptTargetSecrets);
  await fs.writeFile(file, JSON.stringify({ targets: encrypted }, null, 2));
}

/**
 * デプロイターゲットを追加
 */
export async function addDeployTarget(target: DeployTarget): Promise<void> {
  const targets = await getDeployTargets();
  targets.push(target);
  await saveDeployTargets(targets);
}

/**
 * デプロイターゲットを取得（単一）
 */
export async function getDeployTarget(id: string): Promise<DeployTarget | undefined> {
  const targets = await getDeployTargets();
  return targets.find((t) => t.id === id);
}

/**
 * デプロイターゲットを更新
 */
export async function updateDeployTarget(
  id: string,
  updates: Partial<DeployTarget>
): Promise<DeployTarget | undefined> {
  const targets = await getDeployTargets();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1) return undefined;

  targets[index] = { ...targets[index], ...updates };
  await saveDeployTargets(targets);
  return targets[index];
}

/**
 * デプロイターゲットを削除
 */
export async function deleteDeployTarget(id: string): Promise<boolean> {
  const targets = await getDeployTargets();
  const filtered = targets.filter((t) => t.id !== id);
  if (filtered.length === targets.length) return false;

  await saveDeployTargets(filtered);
  return true;
}

/**
 * デプロイターゲットの並び順を変更（ids の順に並べ、含まれないものは末尾に残す）
 */
export async function reorderDeployTargets(ids: string[]): Promise<void> {
  const targets = await getDeployTargets();
  const map = new Map(targets.map((t) => [t.id, t]));
  const reordered = ids.flatMap((id) => {
    const t = map.get(id);
    return t ? [t] : [];
  });
  const rest = targets.filter((t) => !ids.includes(t.id));
  await saveDeployTargets([...reordered, ...rest]);
}

/**
 * サイトに紐づくデプロイターゲットをすべて削除
 */
export async function deleteDeployTargetsBySite(siteId: string): Promise<number> {
  const targets = await getDeployTargets();
  const filtered = targets.filter((t) => t.siteId !== siteId);
  const deletedCount = targets.length - filtered.length;

  if (deletedCount > 0) {
    await saveDeployTargets(filtered);
  }
  return deletedCount;
}
