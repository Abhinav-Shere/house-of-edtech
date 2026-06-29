import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AccessError, requireRole } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_B64_LEN, MAX_SYNC_BYTES, syncSchema } from "@/lib/validation";
import {
  base64ToBytes,
  getRevision,
  mergeAndDiff,
} from "@/lib/server/ydoc-merge";

/**
 * POST /api/documents/:id/sync — the heart of the offline-sync engine.
 *
 * Push:  client sends its accumulated local update (base64 Yjs update).
 * Pull:  client sends its state vector; server returns the minimal diff it's
 *        missing. Both happen in one round trip.
 *
 * Security posture:
 *   - Viewers may PULL but never PUSH (enforced by role + ignoring `update`).
 *   - Content-Length is checked before the body is read (cheap OOM guard).
 *   - The base64 string length is capped by the schema (MAX_B64_LEN) so we
 *     never decode a giant blob into memory.
 *   - Per-user-per-document rate limiting throttles sync floods.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  try {
    // VIEWER may read; pushing is gated separately below.
    const role = await requireRole(userId, id, "VIEWER", {
      notFoundOnDeny: true,
    });

    // --- OOM guard #1: reject oversized bodies before reading them. ---
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    // base64 payload + small JSON envelope; allow a little slack.
    if (declaredLength > MAX_B64_LEN + 512) {
      return NextResponse.json(
        { error: "Payload too large", maxBytes: MAX_SYNC_BYTES },
        { status: 413 },
      );
    }

    // --- Rate limit: 60 syncs / 10s per user per document. ---
    const limited = rateLimit(`sync:${userId}:${id}`, 60, 10_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Slow down — too many sync requests." },
        { status: 429, headers: { "Retry-After": "10" } },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = syncSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid sync payload" },
        { status: 400 },
      );
    }

    const { update, stateVector, knownRevision } = parsed.data;

    // Fast path: pure pull with an up-to-date revision and nothing to push.
    if (!update && typeof knownRevision === "number") {
      const current = await getRevision(id);
      if (current === knownRevision) {
        return NextResponse.json({ upToDate: true, revision: current });
      }
    }

    // VIEWERs cannot mutate shared state. We silently drop their update rather
    // than 403 so a read-only client that *thinks* it can edit still stays in
    // sync for reading.
    const canPush = role === "OWNER" || role === "EDITOR";
    const clientUpdate = canPush && update ? base64ToBytes(update) : null;

    // --- OOM guard #2: decoded size sanity check. ---
    if (clientUpdate && clientUpdate.byteLength > MAX_SYNC_BYTES) {
      return NextResponse.json(
        { error: "Decoded payload too large", maxBytes: MAX_SYNC_BYTES },
        { status: 413 },
      );
    }

    const clientSV = stateVector ? base64ToBytes(stateVector) : null;

    const result = await mergeAndDiff(id, clientUpdate, clientSV);

    return NextResponse.json({
      upToDate: false,
      // Diff the client is missing — apply this to converge.
      update: result.serverUpdate,
      stateVector: result.serverStateVector,
      revision: result.revision,
      byteSize: result.byteSize,
      pushAccepted: Boolean(clientUpdate),
      readOnly: !canPush,
    });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("sync error", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
