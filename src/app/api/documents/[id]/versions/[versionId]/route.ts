import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccessError, requireRole } from "@/lib/rbac";
import { bytesToBase64 } from "@/lib/server/ydoc-merge";

// GET /api/documents/:id/versions/:versionId — return the snapshot bytes so the
// client can preview/restore it. Restore itself happens on the client: it loads
// this snapshot into a temp Y.Doc and replays the content as new CRDT ops on the
// live document, which keeps every collaborator's view convergent and lossless.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "VIEWER", { notFoundOnDeny: true });

    const version = await prisma.version.findFirst({
      where: { id: versionId, documentId: id },
      select: { id: true, label: true, snapshot: true, createdAt: true },
    });
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({
      version: {
        id: version.id,
        label: version.label,
        createdAt: version.createdAt,
        snapshot: bytesToBase64(new Uint8Array(version.snapshot)),
      },
    });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
