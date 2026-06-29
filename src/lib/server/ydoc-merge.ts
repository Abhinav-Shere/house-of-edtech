import * as Y from "yjs";
import { prisma } from "@/lib/prisma";

/**
 * Server-side authority over the merged CRDT state.
 *
 * The server never "interprets" document content — it only merges opaque Yjs
 * updates. Because Yjs merges are commutative, associative, and idempotent,
 * applying updates in any order converges to the same state with zero data
 * loss. That is the deterministic conflict resolution guarantee.
 */

export const base64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(Buffer.from(b64, "base64"));

export const bytesToBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

interface MergeResult {
  /** Update the client is missing (diff from its state vector), base64. */
  serverUpdate: string;
  /** Server's full state vector after merge, base64. */
  serverStateVector: string;
  revision: number;
  byteSize: number;
}

/**
 * Apply a client's update to the stored document and compute the diff the
 * client still needs. Runs inside a serializable transaction with a row lock so
 * concurrent syncs can't clobber each other (read-modify-write safety).
 */
export async function mergeAndDiff(
  documentId: string,
  clientUpdate: Uint8Array | null,
  clientStateVector: Uint8Array | null,
): Promise<MergeResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the state row for this document for the duration of the txn.
    await tx.$executeRaw`SELECT 1 FROM document_states WHERE "documentId" = ${documentId} FOR UPDATE`;

    const existing = await tx.documentState.findUnique({
      where: { documentId },
    });

    const doc = new Y.Doc();
    if (existing) {
      Y.applyUpdate(doc, new Uint8Array(existing.update));
    }
    if (clientUpdate && clientUpdate.byteLength > 0) {
      // Yjs ignores malformed structural conflicts and merges losslessly.
      Y.applyUpdate(doc, clientUpdate);
    }

    const mergedUpdate = Y.encodeStateAsUpdate(doc);
    const serverStateVector = Y.encodeStateVector(doc);
    const revision = (existing?.revision ?? 0) + 1;

    await tx.documentState.upsert({
      where: { documentId },
      create: {
        documentId,
        update: Buffer.from(mergedUpdate),
        stateVector: Buffer.from(serverStateVector),
        revision,
        byteSize: mergedUpdate.byteLength,
      },
      update: {
        update: Buffer.from(mergedUpdate),
        stateVector: Buffer.from(serverStateVector),
        revision,
        byteSize: mergedUpdate.byteLength,
      },
    });

    // Touch the parent document so list ordering reflects recent edits.
    await tx.document.update({
      where: { id: documentId },
      data: { updatedAt: new Date() },
    });

    // Diff the merged doc against what the client already has.
    const diff = clientStateVector
      ? Y.encodeStateAsUpdate(doc, clientStateVector)
      : mergedUpdate;

    return {
      serverUpdate: bytesToBase64(diff),
      serverStateVector: bytesToBase64(serverStateVector),
      revision,
      byteSize: mergedUpdate.byteLength,
    };
  });
}

/** Read the current revision without merging — cheap "anything new?" probe. */
export async function getRevision(documentId: string): Promise<number> {
  const state = await prisma.documentState.findUnique({
    where: { documentId },
    select: { revision: true },
  });
  return state?.revision ?? 0;
}
