"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Terminal } from "lucide-react";
import { COMMANDS } from "./constants";
import { useClipboard } from "./hooks";

interface CommandListProps {
  sitePath: string;
}

export function CommandList({ sitePath }: CommandListProps) {
  const [showCommands, setShowCommands] = useState(false);
  const { copy, isCopied } = useClipboard();

  return (
    <div className="pt-2 border-t mt-3">
      <button
        onClick={() => setShowCommands(!showCommands)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-full text-left"
      >
        <Terminal className="w-4 h-4 shrink-0" />
        <span className="flex-1">コマンドリスト</span>
        {showCommands ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {showCommands && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            サイトディレクトリで実行: <code className="bg-muted px-1 rounded">{sitePath}</code>
          </p>
          {COMMANDS.map((group) => (
            <div key={group.category}>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                {group.category}
              </h4>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="group flex items-center gap-2 text-xs"
                  >
                    <span className="text-muted-foreground w-28 shrink-0">
                      {item.label}
                    </span>
                    <code className="flex-1 bg-muted px-2 py-1 rounded text-[11px] font-mono truncate">
                      {item.cmd}
                    </code>
                    <button
                      onClick={() => copy(item.cmd)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                      title="コピー"
                    >
                      {isCopied(item.cmd) ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
