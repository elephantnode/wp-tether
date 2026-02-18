"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, ExternalLink, Share2, X } from "lucide-react";

interface TunnelDialogProps {
  siteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelUrl: string | null;
  tunnelProvider: string | null;
  onCopyUrl: () => void;
  onStop: () => void;
}

export function TunnelDialog({
  siteName,
  open,
  onOpenChange,
  tunnelUrl,
  tunnelProvider,
  onCopyUrl,
  onStop,
}: TunnelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            公開URL - {siteName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {tunnelUrl && (
            <>
              {/* QRコード */}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/qrcode?url=${encodeURIComponent(tunnelUrl)}`}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>

              {/* URL */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tunnelUrl}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm bg-muted rounded-md font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCopyUrl}
                  title="URLをコピー"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={tunnelUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>

              <div className="text-xs text-muted-foreground text-center space-y-1">
                {tunnelProvider && (
                  <p className="font-medium">
                    Provider: {tunnelProvider === "cloudflared" ? "Cloudflare Tunnel" : "ngrok"}
                  </p>
                )}
                <p>このURLはセッション中のみ有効です。ブラウザを閉じると無効になります。</p>
              </div>

              {/* 停止ボタン */}
              <Button
                variant="outline"
                onClick={onStop}
                className="w-full text-destructive"
              >
                <X className="w-4 h-4 mr-2" />
                公開を停止
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
