import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccessError, requireRole } from "@/lib/rbac";
import { createVersionSchema, MAX_B64_LEN, MAX_SYNC_BYTES } from "@/lib/validation";
import { base64ToBytes } from "@/lib/server/ydoc-merge";

// GET /api/documents/:id/versions — timeline of saved snapshots.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "VIEWER", { notFoundOnDeny: true });
    const versions = await prisma.version.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        byteSize: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
      },
    });
    return NextResponse.json({ versions });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/documents/:id/versions — capture a snapshot (editor or higher).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  try {
    await requireRole(userId, id, "EDITOR", { notFoundOnDeny: true });

    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_B64_LEN + 512) {
      return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid snapshot" },
        { status: 400 },
      );
    }

    const bytes = base64ToBytes(parsed.data.snapshot);
    if (bytes.byteLength > MAX_SYNC_BYTES) {
      return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
    }

    const version = await prisma.version.create({
      data: {
        documentId: id,
        label: parsed.data.label,
        snapshot: Buffer.from(bytes),
        byteSize: bytes.byteLength,
        createdById: userId!,
      },
      select: {
        id: true,
        label: true,
        byteSize: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
