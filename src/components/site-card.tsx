import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Play, Square, Trash2 } from "lucide-react";

interface SiteCardProps {
  site: {
    id: string;
    name: string;
    status: "running" | "stopped" | "creating" | "error";
    port: number;
    dbType: string;
  };
}

export function SiteCard({ site }: SiteCardProps) {
  const isRunning = site.status === "running";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{site.name}</CardTitle>
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "● Running" : "○ Stopped"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent
        className="text-sm text-muted-foreground
  space-y-1"
      >
        <p>Port: {site.port}</p>
        <p>DB: {site.dbType}</p>
      </CardContent>

      <CardFooter className="gap-2">
        {isRunning ? (
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={`http://localhost:${site.port}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-1" />
                開く
              </a>
            </Button>
            <Button size="sm" variant="outline">
              <Square className="w-4 h-4 mr-1" />
              停止
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline">
              <Play className="w-4 h-4 mr-1" />
              起動
            </Button>
            <Button size="sm" variant="outline" className="text-destructive">
              <Trash2 className="w-4 h-4 mr-1" />
              削除
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
