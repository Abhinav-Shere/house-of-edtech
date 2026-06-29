"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Plus, RotateCcw } from "lucide-react";
import type { SyncEngine } from "@/lib/local/sync-engine";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatBytes } from "@/lib/utils";

interface Version {
  id: string;
  label: string;
  byteSize: number;
  createdAt: string;
  createdBy: { name: string | null; email: string };
}

interface Props {
  documentId: string;
  engine: React.RefObject<SyncEngine | null>;
  canEdit: boolean;
}

export function VersionTimeline({ documentId, engine, canEdit }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/versions`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions);
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const capture = async () => {
    const label = window.prompt("Name this version", `Snapshot ${new Date().toLocaleString()}`);
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      await engine.current?.captureVersion(label);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save version");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (versionId: string, label: string) => {
    if (!window.confirm(`Restore "${label}"? Current text is replaced for everyone, but no version is deleted.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${versionId}`);
      if (!res.ok) throw new Error("Could not load that version");
      const data = await res.json();
      await engine.current?.restoreVersion(data.version.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="versions-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="versions-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="size-4 text-muted" aria-hidden /> Version history
        </h2>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={capture} disabled={busy}>
            <Plus className="size-3.5" aria-hidden /> Save version
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="text-xs text-faint">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs text-faint">
          No versions yet. Save one to bookmark this moment — you can travel back anytime.
        </p>
      ) : (
        <ol className="relative space-y-1 border-l border-line pl-4">
          {versions.map((v) => (
            <li key={v.id} className="relative pb-3">
              <span className="absolute -left-[1.30rem] top-1.5 size-2 rounded-full bg-signal" aria-hidden />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{v.label}</p>
                  <p className="font-mono text-[11px] text-faint">
                    {formatRelativeTime(v.createdAt)} · {formatBytes(v.byteSize)} ·{" "}
                    {v.createdBy.name ?? v.createdBy.email}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => restore(v.id, v.label)}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted hover:bg-line/60 hover:text-ink disabled:opacity-50"
                    title="Restore this version"
                  >
                    <RotateCcw className="size-3" aria-hidden /> Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
