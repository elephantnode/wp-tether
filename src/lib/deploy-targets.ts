import fs from "fs/promises";
import path from "path";
import { DeployTarget } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DEPLOY_TARGETS_FILE = path.join(DATA_DIR, "deploy-targets.json");

interface DeployTargetsData {
  targets: DeployTarget[];
}

/**
 * デプロイターゲット一覧を取得
 */
export async function getDeployTargets(siteId?: string): Promise<DeployTarget[]> {
  try {
    const content = await fs.readFile(DEPLOY_TARGETS_FILE, "utf-8");
    const data: DeployTargetsData = JSON.parse(content);
    if (siteId) {
      return data.targets.filter((t) => t.siteId === siteId);
    }
    return data.targets;
  } catch {
    return [];
  }
}

/**
 * デプロイターゲットを保存
 */
export async function saveDeployTargets(targets: DeployTarget[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DEPLOY_TARGETS_FILE, JSON.stringify({ targets }, null, 2));
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
