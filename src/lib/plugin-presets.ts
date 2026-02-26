import fs from "fs/promises";
import path from "path";
import { resolvePluginPresetsJsonPath } from "./app-config";

export interface PluginPresets {
  plugins: string[];
}

/**
 * プラグインプリセットを取得
 */
export async function getPluginPresets(): Promise<PluginPresets> {
  try {
    const file = await resolvePluginPresetsJsonPath();
    const content = await fs.readFile(file, "utf-8");
    return JSON.parse(content);
  } catch {
    return { plugins: [] };
  }
}

/**
 * プラグインプリセットを保存
 */
export async function savePluginPresets(presets: PluginPresets): Promise<void> {
  const file = await resolvePluginPresetsJsonPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(presets, null, 2));
}
