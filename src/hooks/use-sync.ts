"use client";
import { useEffect, useRef, useState } from "react";
import { SyncEngine, type SyncState } from "@/lib/local/sync-engine";

/**
 * Spin up a SyncEngine for a document and subscribe to its state. The engine is
 * created once per documentId and torn down on unmount.
 */
export function useSync(documentId: string) {
  const engineRef = useRef<SyncEngine | null>(null);
  const [state, setState] = useState<SyncState>({
    status: "initializing",
    online: true,
    pending: false,
    lastSyncedAt: null,
    revision: 0,
    readOnly: false,
    error: null,
  });

  useEffect(() => {
    const engine = new SyncEngine(documentId);
    engineRef.current = engine;
    const unsub = engine.subscribe(setState);
    void engine.start();
    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
  }, [documentId]);

  return { engine: engineRef, state };
}
