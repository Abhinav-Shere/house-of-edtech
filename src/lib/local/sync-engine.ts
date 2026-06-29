import * as Y from "yjs";
import {
  base64FromBytes,
  bytesFromBase64,
  CONTENT_KEY,
  getLocalDoc,
  type LocalDoc,
} from "@/lib/local/ydoc";
import { getSyncMeta, setSyncMeta } from "@/lib/local/db";

export type SyncStatus =
  | "initializing"
  | "offline"
  | "syncing"
  | "synced"
  | "error";

export interface SyncState {
  status: SyncStatus;
  online: boolean;
  pending: boolean; // local changes not yet acknowledged by the server
  lastSyncedAt: number | null;
  revision: number;
  readOnly: boolean;
  error: string | null;
}

type Listener = (state: SyncState) => void;

const POLL_MS = Number(process.env.NEXT_PUBLIC_SYNC_POLL_MS ?? 4000);
const PUSH_DEBOUNCE_MS = 600;
const EMPTY_UPDATE_BYTES = 2; // a Yjs "no-op" update encodes to 2 bytes

/**
 * Orchestrates reconciliation between the local-first Y.Doc and the server.
 *
 * - Edits are captured locally first (offline-safe) and pushed when possible.
 * - On reconnect, queued local ops are pushed and remote ops pulled in one
 *   round trip; neither side overwrites the other (CRDT merge).
 * - A lightweight poll pulls collaborators' changes while the doc is open.
 */
export class SyncEngine {
  private local: LocalDoc;
  private listeners = new Set<Listener>();
  private serverStateVector: Uint8Array | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private disposed = false;
  private cleanupFns: (() => void)[] = [];

  private state: SyncState = {
    status: "initializing",
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    pending: false,
    lastSyncedAt: null,
    revision: 0,
    readOnly: false,
    error: null,
  };

  constructor(private documentId: string) {
    this.local = getLocalDoc(documentId);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): SyncState {
    return this.state;
  }

  private emit(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  async start() {
    // Wait for the local persisted copy to load — this is the "local-first"
    // guarantee: content is available before any network call.
    await this.local.whenSynced;
    if (this.disposed) return;

    const meta = await getSyncMeta(this.documentId);
    this.serverStateVector = meta.serverStateVector
      ? bytesFromBase64(meta.serverStateVector)
      : null;
    this.emit({ revision: meta.revision, lastSyncedAt: meta.lastSyncedAt });

    // React to local edits: mark pending, debounce a push.
    const onUpdate = (_u: Uint8Array, origin: unknown) => {
      // 'sync' origin = changes we just applied from the server; don't echo.
      if (origin === "sync") return;
      this.refreshPending();
      this.schedulePush();
    };
    this.local.doc.on("update", onUpdate);
    this.cleanupFns.push(() => this.local.doc.off("update", onUpdate));

    // Network transitions.
    const onOnline = () => {
      this.emit({ online: true });
      void this.syncNow();
    };
    const onOffline = () => this.emit({ online: false, status: "offline" });
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      this.cleanupFns.push(() => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      });
    }

    this.refreshPending();
    // Poll for remote changes while open.
    this.pollTimer = setInterval(() => void this.syncNow(), POLL_MS);
    await this.syncNow();
  }

  private refreshPending() {
    const pushUpdate = this.computePush();
    this.emit({ pending: pushUpdate.byteLength > EMPTY_UPDATE_BYTES });
  }

  private computePush(): Uint8Array {
    return this.serverStateVector
      ? Y.encodeStateAsUpdate(this.local.doc, this.serverStateVector)
      : Y.encodeStateAsUpdate(this.local.doc);
  }

  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.syncNow(), PUSH_DEBOUNCE_MS);
  }

  /** Push local changes and pull remote changes in a single round trip. */
  async syncNow(): Promise<void> {
    if (this.disposed || this.inFlight) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.emit({ online: false, status: "offline" });
      return;
    }

    this.inFlight = true;
    this.emit({ status: "syncing", error: null });

    try {
      const pushUpdate = this.computePush();
      const hasLocalChanges = pushUpdate.byteLength > EMPTY_UPDATE_BYTES;
      const stateVector = Y.encodeStateVector(this.local.doc);

      const res = await fetch(`/api/documents/${this.documentId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update: hasLocalChanges ? base64FromBytes(pushUpdate) : undefined,
          stateVector: base64FromBytes(stateVector),
          knownRevision: this.state.revision,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }

      const data = (await res.json()) as {
        upToDate: boolean;
        update?: string;
        stateVector?: string;
        revision?: number;
        readOnly?: boolean;
      };

      if (data.readOnly) this.emit({ readOnly: true });

      if (data.upToDate) {
        this.emit({
          status: "synced",
          lastSyncedAt: Date.now(),
          online: true,
        });
      } else {
        if (data.update) {
          const remote = bytesFromBase64(data.update);
          if (remote.byteLength > EMPTY_UPDATE_BYTES) {
            // Apply with a 'sync' origin so our update listener doesn't loop.
            Y.applyUpdate(this.local.doc, remote, "sync");
          }
        }
        if (data.stateVector) {
          this.serverStateVector = bytesFromBase64(data.stateVector);
        }
        const revision = data.revision ?? this.state.revision;
        const lastSyncedAt = Date.now();
        this.emit({ status: "synced", revision, lastSyncedAt, online: true });
        await setSyncMeta({
          documentId: this.documentId,
          serverStateVector: this.serverStateVector
            ? base64FromBytes(this.serverStateVector)
            : null,
          revision,
          lastSyncedAt,
        });
      }

      this.refreshPending();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      this.emit({ status: "error", error: message });
    } finally {
      this.inFlight = false;
    }
  }

  /** Capture an immutable snapshot of the current document state. */
  async captureVersion(label: string): Promise<void> {
    const snapshot = Y.encodeStateAsUpdate(this.local.doc);
    const res = await fetch(`/api/documents/${this.documentId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, snapshot: base64FromBytes(snapshot) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Could not save version");
    }
  }

  /**
   * Restore a snapshot WITHOUT destroying shared history. The snapshot's content
   * is replayed as new CRDT operations on the live document, so every active
   * collaborator converges to the restored text — no one's session is corrupted.
   */
  async restoreVersion(snapshotBase64: string): Promise<void> {
    const temp = new Y.Doc();
    Y.applyUpdate(temp, bytesFromBase64(snapshotBase64));
    const restoredText = temp.getText(CONTENT_KEY).toString();
    temp.destroy();

    const live = this.local.text;
    this.local.doc.transact(() => {
      if (live.length > 0) live.delete(0, live.length);
      if (restoredText.length > 0) live.insert(0, restoredText);
    }, "local");

    this.refreshPending();
    await this.syncNow();
  }

  dispose() {
    this.disposed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.listeners.clear();
  }
}
