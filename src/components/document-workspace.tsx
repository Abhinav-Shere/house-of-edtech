"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Check, Pencil } from "lucide-react";
import { useSync } from "@/hooks/use-sync";
import { ConnectionStatus } from "@/components/connection-status";
import { Editor } from "@/components/editor";
import { VersionTimeline } from "@/components/version-timeline";
import { CollaboratorsPanel } from "@/components/collaborators-panel";
import { AiPanel } from "@/components/ai-panel";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";

type Role = "OWNER" | "EDITOR" | "VIEWER";

interface Props {
  documentId: string;
  initialTitle: string;
  role: Role;
}

type Tab = "history" | "people" | "ai";

export function DocumentWorkspace({ documentId, initialTitle, role }: Props) {
  const { engine, state } = useSync(documentId);
  const canEdit = role === "OWNER" || role === "EDITOR";

  const [title, setTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [tab, setTab] = useState<Tab>("history");

  const saveTitle = async (next: string) => {
    setEditingTitle(false);
    const trimmed = next.trim();
    if (!trimmed || trimmed === title) return;
    setTitle(trimmed);
    await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link
            href="/documents"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-line/60 hover:text-ink"
            aria-label="Back to documents"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>

          <div className="min-w-0 flex-1">
            {editingTitle && canEdit ? (
              <input
                autoFocus
                defaultValue={title}
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full rounded border border-line bg-surface px-2 py-1 text-base font-semibold text-ink outline-none focus:border-signal"
                aria-label="Document title"
              />
            ) : (
              <button
                onClick={() => canEdit && setEditingTitle(true)}
                className="group inline-flex max-w-full items-center gap-1.5 truncate text-base font-semibold text-ink"
                title={canEdit ? "Rename" : title}
              >
                <span className="truncate">{title}</span>
                {canEdit && (
                  <Pencil className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                )}
              </button>
            )}
          </div>

          <ConnectionStatus state={state} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => engine.current?.syncNow()}
            disabled={state.status === "syncing" || !state.online}
            title="Sync now"
            aria-label="Sync now"
          >
            {state.status === "synced" && !state.pending ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <RefreshCw className={state.status === "syncing" ? "size-4 animate-spin" : "size-4"} aria-hidden />
            )}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-0 px-0 lg:grid-cols-[1fr_20rem]">
        <div className="order-2 flex min-h-[60vh] flex-col border-line lg:order-1 lg:border-r">
          <Editor documentId={documentId} readOnly={!canEdit} />
        </div>

        <aside className="order-1 border-b border-line bg-paper lg:order-2 lg:border-b-0">
          <div className="flex border-b border-line text-sm" role="tablist" aria-label="Document tools">
            {(["history", "people", "ai"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2.5 font-medium capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-ink text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {t === "ai" ? "AI" : t}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === "history" && (
              <VersionTimeline documentId={documentId} engine={engine} canEdit={canEdit} />
            )}
            {tab === "people" && (
              <CollaboratorsPanel documentId={documentId} currentRole={role} />
            )}
            {tab === "ai" && <AiPanel documentId={documentId} canEdit={canEdit} />}
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}
