import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PRESETS_FILE = path.join(DATA_DIR, "plugin-presets.json");

export interface PluginPresets {
  plugins: string[];
}

/**
 * プラグインプリセットを取得
 */
export async function getPluginPresets(): Promise<PluginPresets> {
  try {
    const content = await fs.readFile(PRESETS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { plugins: [] };
  }
}

/**
 * プラグインプリセットを保存
 */
export async function savePluginPresets(presets: PluginPresets): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
}
