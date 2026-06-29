"use client";

import { useEffect, useState } from "react";
import type { SyncState } from "@/lib/local/sync-engine";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The signature element. A single pill that makes the invisible sync engine
 * legible: a pulsing dot keyed to live state, a plain-language label, the count
 * of changes still in the local queue, and the document revision. This is the
 * thing the whole "local-first" idea is remembered by.
 */

interface Tone {
  label: string;
  dot: string; // text-color drives both dot + pulse via currentColor
  pulse: boolean;
}

function toneFor(state: SyncState): Tone {
  if (!state.online) {
    return state.pending
      ? { label: "Offline — changes saved locally", dot: "text-warn", pulse: false }
      : { label: "Offline", dot: "text-rest", pulse: false };
  }
  switch (state.status) {
    case "syncing":
      return { label: "Syncing…", dot: "text-signal", pulse: true };
    case "error":
      return { label: "Sync error", dot: "text-danger", pulse: false };
    case "synced":
      return state.pending
        ? { label: "Saving changes…", dot: "text-warn", pulse: true }
        : { label: "All changes synced", dot: "text-signal", pulse: false };
    default:
      return { label: "Connecting…", dot: "text-rest", pulse: true };
  }
}

export function ConnectionStatus({ state }: { state: SyncState }) {
  const tone = toneFor(state);
  // Re-render the relative timestamp every so often.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full bg-current",
          tone.dot,
          tone.pulse && "pulse-dot",
        )}
        aria-hidden
      />
      <span className="font-medium text-ink">{tone.label}</span>

      {state.readOnly && (
        <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
          read-only
        </span>
      )}

      <span className="hidden font-mono text-[11px] text-faint sm:inline">
        rev {state.revision}
      </span>

      {state.lastSyncedAt && !state.pending && state.online && (
        <span className="hidden text-[11px] text-faint md:inline">
          {formatRelativeTime(new Date(state.lastSyncedAt))}
        </span>
      )}

      {state.error && (
        <span className="max-w-[16rem] truncate text-[11px] text-danger" title={state.error}>
          {state.error}
        </span>
      )}
    </div>
  );
}
