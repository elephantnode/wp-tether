"use client";

import { useState, useEffect } from "react";

export interface Template {
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

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "default",
    name: "Default WordPress",
    description: "MariaDB + PHP 8.2 の標準構成",
    wordpress: { version: "latest", debug: true },
    php: { version: "8.2" },
    database: {
      type: "mariadb",
      version: "10.6",
      name: "wordpress",
      user: "wordpress",
      password: "wordpress",
      rootPassword: "somewordpress",
    },
    exclude: [],
  },
];

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          throw new Error("Failed to fetch templates");
        }
        const data = await res.json();
        setTemplates(data.templates);
      } catch (err) {
        console.error("Failed to fetch templates:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  const getTemplate = (id: string): Template | undefined => {
    return templates.find((t) => t.id === id);
  };

  return { templates, isLoading, error, getTemplate };
}
