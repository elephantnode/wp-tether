import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import YAML from "yaml";

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  wordpress: {
    version: string;
    debug: boolean;
  };
  php: {
    version: string;
  };
  database: {
    type: "mariadb" | "mysql";
    version: string;
    name: string;
    user: string;
    password: string;
    rootPassword: string;
  };
  exclude: string[];
}

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

export async function GET() {
  try {
    const files = await fs.readdir(TEMPLATES_DIR);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    const templates: TemplateConfig[] = await Promise.all(
      yamlFiles.map(async (file) => {
        const content = await fs.readFile(
          path.join(TEMPLATES_DIR, file),
          "utf-8"
        );
        const parsed = YAML.parse(content);
        const id = file.replace(/\.(yml|yaml)$/, "");
        return {
          id,
          ...parsed,
        };
      })
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to load templates:", error);
    return NextResponse.json(
      { error: "Failed to load templates" },
      { status: 500 }
    );
  }
}
