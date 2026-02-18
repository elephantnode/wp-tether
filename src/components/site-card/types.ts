export interface SiteInfo {
  id: string;
  name: string;
  status: "running" | "stopped" | "creating" | "error";
  hostname: string;
  hostnameMode?: "localhost" | "custom";
  path: string;
  port: number;
  wpVersion: string;
  phpVersion: string;
  dbType: string;
  admin?: {
    user: string;
    password: string;
    email: string;
  };
}

export interface SiteCardProps {
  site: SiteInfo;
}
