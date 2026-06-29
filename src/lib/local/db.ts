import { openDB, type IDBPDatabase } from "idb";

/**
 * A tiny IndexedDB store that remembers, per document, the last server state
 * vector and revision the client has reconciled with. This is what lets the
 * sync engine compute a *minimal* push (only ops the server lacks) and survive
 * full offline sessions: the Y.Doc itself (persisted by y-indexeddb) holds the
 * content, and this store holds the bookkeeping needed to reconcile it later.
 */

const DB_NAME = "lfe-meta";
const STORE = "sync-meta";

export interface SyncMeta {
  documentId: string;
  serverStateVector: string | null; // base64
  revision: number;
  lastSyncedAt: number | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "documentId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getSyncMeta(documentId: string): Promise<SyncMeta> {
  const db = await getDb();
  const existing = (await db.get(STORE, documentId)) as SyncMeta | undefined;
  return (
    existing ?? {
      documentId,
      serverStateVector: null,
      revision: 0,
      lastSyncedAt: null,
    }
  );
}

export async function setSyncMeta(meta: SyncMeta): Promise<void> {
  const db = await getDb();
  await db.put(STORE, meta);
}
