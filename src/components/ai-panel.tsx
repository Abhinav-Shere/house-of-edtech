"use client";

import { useEffect, useState } from "react";
import { Sparkles, ClipboardCopy } from "lucide-react";
import type { AiAction } from "@/lib/validation";
import { getLocalDoc } from "@/lib/local/ydoc";
import { Button } from "@/components/ui/button";

interface Props {
  documentId: string;
  canEdit: boolean;
}

const ACTIONS: { key: AiAction; label: string; needsEdit: boolean }[] = [
  { key: "summarize", label: "Summarize", needsEdit: false },
  { key: "improve", label: "Improve writing", needsEdit: true },
  { key: "continue", label: "Continue", needsEdit: true },
  { key: "title", label: "Suggest title", needsEdit: false },
];

export function AiPanel({ documentId, canEdit }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState<AiAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === false) {
    return (
      <section aria-labelledby="ai-heading" className="space-y-2">
        <h2 id="ai-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-muted" aria-hidden /> AI assistant
        </h2>
        <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-faint">
          Add an <code className="font-mono">AI_API_KEY</code> to enable AI features.
          The app works fully without it.
        </p>
      </section>
    );
  }

  const run = async (action: AiAction) => {
    const text = getLocalDoc(documentId).text.toString().slice(0, 20_000);
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }
    setBusy(action);
    setError(null);
    setResult("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI request failed");
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy(null);
    }
  };

  const insert = () => {
    const { text, doc } = getLocalDoc(documentId);
    doc.transact(() => {
      text.insert(text.length, (text.length ? "\n\n" : "") + result);
    }, "local");
    setResult("");
  };

  return (
    <section aria-labelledby="ai-heading" className="space-y-3">
      <h2 id="ai-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles className="size-4 text-muted" aria-hidden /> AI assistant
      </h2>

      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((a) => (
          <Button
            key={a.key}
            size="sm"
            variant="outline"
            disabled={busy !== null || (a.needsEdit && !canEdit)}
            onClick={() => run(a.key)}
          >
            {busy === a.key ? "Thinking…" : a.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-lg border border-line bg-paper p-3">
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{result}</p>
          <div className="flex gap-1.5">
            {canEdit && (
              <Button size="sm" onClick={insert}>
                Insert
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigator.clipboard?.writeText(result)}
            >
              <ClipboardCopy className="size-3.5" aria-hidden /> Copy
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
