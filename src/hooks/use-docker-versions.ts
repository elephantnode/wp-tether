"use client";

import { useState, useEffect } from "react";

interface DockerVersions {
  wordpress: string[];
  mariadb: string[];
  mysql: string[];
  php: string[];
}

const DEFAULT_VERSIONS: DockerVersions = {
  wordpress: ["latest", "6.9", "6.8", "6.7", "6.6", "6.5"],
  mariadb: ["latest", "11.4", "10.11", "10.6", "10.5"],
  mysql: ["latest", "8.4", "8.0", "5.7"],
  php: ["latest", "8.3", "8.2", "8.1", "8.0"],
};

export function useDockerVersions() {
  const [versions, setVersions] = useState<DockerVersions>(DEFAULT_VERSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersions() {
      try {
        const res = await fetch("/api/docker/tags");
        if (!res.ok) {
          throw new Error("Failed to fetch versions");
        }
        const data = await res.json();
        setVersions(data);
      } catch (err) {
        console.error("Failed to fetch Docker versions:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // フォールバックを使用
      } finally {
        setIsLoading(false);
      }
    }

    fetchVersions();
  }, []);

  return { versions, isLoading, error };
}
