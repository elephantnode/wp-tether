"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Container,
  RefreshCw,
  MoreVertical,
  FileText,
  RotateCcw,
  Loader2,
} from "lucide-react";
import type { ContainerInfo } from "@/app/api/containers/route";

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContainer, setSelectedContainer] =
    useState<ContainerInfo | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch("/api/containers");
      const data = await res.json();
      setContainers(data.containers || []);
    } catch (error) {
      console.error("Failed to fetch containers:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchContainers();
  };

  const handleViewLogs = async (container: ContainerInfo) => {
    setSelectedContainer(container);
    setLogsLoading(true);
    setLogs("");

    try {
      const res = await fetch(`/api/containers/${container.id}/logs?tail=200`);
      const data = await res.json();
      setLogs(data.logs || "ログがありません");
    } catch {
      setLogs("ログの取得に失敗しました");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRestart = async (container: ContainerInfo) => {
    setActionLoading(container.id);
    try {
      await fetch(`/api/containers/${container.id}/restart`, {
        method: "POST",
      });
      // 少し待ってから更新
      setTimeout(() => {
        fetchContainers();
        setActionLoading(null);
      }, 2000);
    } catch (error) {
      console.error("Failed to restart container:", error);
      setActionLoading(null);
    }
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case "running":
        return <Badge className="bg-green-500">Running</Badge>;
      case "exited":
        return <Badge variant="secondary">Exited</Badge>;
      case "paused":
        return <Badge variant="outline">Paused</Badge>;
      case "restarting":
        return <Badge className="bg-yellow-500">Restarting</Badge>;
      case "created":
        return <Badge variant="outline">Created</Badge>;
      case "dead":
        return <Badge variant="destructive">Dead</Badge>;
      default:
        return <Badge variant="secondary">{state}</Badge>;
    }
  };

  // サイトごとにグループ化
  const containersBySite = containers.reduce(
    (acc, container) => {
      if (!acc[container.siteName]) {
        acc[container.siteName] = [];
      }
      acc[container.siteName].push(container);
      return acc;
    },
    {} as Record<string, ContainerInfo[]>
  );

  const runningCount = containers.filter((c) => c.state === "running").length;
  const stoppedCount = containers.filter((c) => c.state !== "running").length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">コンテナ</h1>
          <p className="text-muted-foreground">
            全サイトのDockerコンテナ状況
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          更新
        </Button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{containers.length}</div>
            <p className="text-sm text-muted-foreground">総コンテナ数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {runningCount}
            </div>
            <p className="text-sm text-muted-foreground">稼働中</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground">
              {stoppedCount}
            </div>
            <p className="text-sm text-muted-foreground">停止中</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">コンテナ情報を取得中...</p>
          </CardContent>
        </Card>
      ) : containers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Container className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">コンテナがありません</h3>
            <p className="text-muted-foreground">
              サイトを作成して起動すると、ここにコンテナが表示されます
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(containersBySite).map(([siteName, siteContainers]) => (
            <Card key={siteName}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">{siteName}</h2>
                  <Badge variant="outline">
                    {siteContainers.length} コンテナ
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>サービス</TableHead>
                      <TableHead>コンテナ名</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>イメージ</TableHead>
                      <TableHead>状態</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>ポート</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteContainers.map((container) => (
                      <TableRow key={container.id}>
                        <TableCell className="font-medium">
                          {container.service}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {container.name}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {container.id.slice(0, 12)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {container.image.length > 30
                            ? container.image.slice(0, 30) + "..."
                            : container.image}
                        </TableCell>
                        <TableCell>{getStateBadge(container.state)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {container.status}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {container.ports || "-"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionLoading === container.id}
                              >
                                {actionLoading === container.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="w-4 h-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleViewLogs(container)}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                ログを表示
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRestart(container)}
                              >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                再起動
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ログダイアログ */}
      <Dialog
        open={!!selectedContainer}
        onOpenChange={() => setSelectedContainer(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedContainer?.siteName} / {selectedContainer?.service} -
              ログ
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="text-xs font-mono bg-muted p-4 rounded-md whitespace-pre-wrap break-all">
                {logs}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
