"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteSiteDialogProps {
  siteName: string;
  sitePath: string;
  isDeleting: boolean;
  isLoading: boolean;
  onDelete: (deleteFiles: boolean, deleteVolumes: boolean) => void;
}

export function DeleteSiteDialog({
  siteName,
  sitePath,
  isDeleting,
  isLoading,
  onDelete,
}: DeleteSiteDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={isLoading || isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-1" />
          )}
          {isDeleting ? "削除中..." : "削除"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>サイトを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{siteName}」を削除します。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start space-x-2">
            <Checkbox
              id="deleteVolumes"
              checked={deleteVolumes}
              onCheckedChange={(checked: boolean) => setDeleteVolumes(checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <label
                htmlFor="deleteVolumes"
                className="text-sm font-medium cursor-pointer block"
              >
                Dockerボリュームも削除する
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                データベースやCaddyの設定データが完全に削除されます。次回作成時に新しいデータベースが作成されます。
              </p>
              {deleteVolumes && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 font-medium">
                  ⚠️ 警告: この操作により、すべてのデータベースデータが失われます。
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="deleteFiles"
              checked={deleteFiles}
              onCheckedChange={(checked: boolean) => setDeleteFiles(checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <label
                htmlFor="deleteFiles"
                className="text-sm font-medium cursor-pointer block"
              >
                ローカルファイルも削除する
              </label>
              <p className="text-xs text-muted-foreground mt-1">{sitePath}</p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete(deleteFiles, deleteVolumes)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            削除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
