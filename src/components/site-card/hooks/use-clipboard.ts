import { useState, useCallback } from "react";

export function useClipboard(timeout = 2000) {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), timeout);
      } catch {
        // フォールバック
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), timeout);
      }
    },
    [timeout]
  );

  const isCopied = useCallback(
    (text: string) => copiedText === text,
    [copiedText]
  );

  return { copy, isCopied, copiedText };
}
