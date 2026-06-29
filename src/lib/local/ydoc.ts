import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

/**
 * Local-first document layer.
 *
 * The Y.Doc is the PRIMARY source of truth. y-indexeddb persists it to the
 * browser so a user can open, edit, and close a document with zero network
 * requests. The server is just a peer the doc reconciles with when online.
 */

export const CONTENT_KEY = "content";

export interface LocalDoc {
  doc: Y.Doc;
  text: Y.Text;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
}

const cache = new Map<string, LocalDoc>();

export function getLocalDoc(documentId: string): LocalDoc {
  const cached = cache.get(documentId);
  if (cached) return cached;

  const doc = new Y.Doc();
  const text = doc.getText(CONTENT_KEY);
  const persistence = new IndexeddbPersistence(`lfe-doc-${documentId}`, doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once("synced", () => resolve());
  });

  const local: LocalDoc = { doc, text, persistence, whenSynced };
  cache.set(documentId, local);
  return local;
}

export async function destroyLocalDoc(documentId: string): Promise<void> {
  const local = cache.get(documentId);
  if (!local) return;
  await local.persistence.destroy();
  local.doc.destroy();
  cache.delete(documentId);
}

export const base64FromBytes = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const bytesFromBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

/**
 * Two-way bind a Y.Text to a <textarea>.
 *
 * Local edits are diffed (common prefix/suffix) into precise insert/delete CRDT
 * ops — never a wholesale replace — so concurrent remote edits merge cleanly.
 * Remote edits update the textarea while preserving the caret. Returns a
 * cleanup function.
 */
export function bindTextarea(text: Y.Text, textarea: HTMLTextAreaElement): () => void {
  let applyingRemote = false;

  // Seed the textarea from current CRDT content.
  textarea.value = text.toString();

  const onInput = () => {
    if (applyingRemote) return;
    const oldValue = text.toString();
    const newValue = textarea.value;
    if (oldValue === newValue) return;

    // Find the unchanged prefix/suffix so we touch the minimum range.
    let start = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (start < minLen && oldValue[start] === newValue[start]) start++;

    let endOld = oldValue.length;
    let endNew = newValue.length;
    while (
      endOld > start &&
      endNew > start &&
      oldValue[endOld - 1] === newValue[endNew - 1]
    ) {
      endOld--;
      endNew--;
    }

    const deleteLen = endOld - start;
    const insertStr = newValue.slice(start, endNew);

    text.doc?.transact(() => {
      if (deleteLen > 0) text.delete(start, deleteLen);
      if (insertStr.length > 0) text.insert(start, insertStr);
    }, "local");
  };

  const observer = (event: Y.YTextEvent, txn: Y.Transaction) => {
    // Ignore our own local edits — the textarea already reflects them.
    if (txn.origin === "local") return;

    applyingRemote = true;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;

    // Map the caret across the incoming delta so typing isn't disrupted.
    let caretStart = selStart;
    let caretEnd = selEnd;
    let cursor = 0;
    for (const op of event.delta) {
      if (op.retain != null) {
        cursor += op.retain;
      } else if (typeof op.insert === "string") {
        if (cursor <= caretStart) caretStart += op.insert.length;
        if (cursor <= caretEnd) caretEnd += op.insert.length;
        cursor += op.insert.length;
      } else if (op.delete != null) {
        if (cursor < caretStart) caretStart -= Math.min(op.delete, caretStart - cursor);
        if (cursor < caretEnd) caretEnd -= Math.min(op.delete, caretEnd - cursor);
      }
    }

    const next = text.toString();
    textarea.value = next;
    const clamp = (n: number) => Math.max(0, Math.min(n, next.length));
    textarea.setSelectionRange(clamp(caretStart), clamp(caretEnd));
    applyingRemote = false;
  };

  textarea.addEventListener("input", onInput);
  text.observe(observer);

  return () => {
    textarea.removeEventListener("input", onInput);
    text.unobserve(observer);
  };
}
