import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccessError, requireRole } from "@/lib/rbac";
import { updateDocumentSchema } from "@/lib/validation";

function handleAccessError(e: unknown) {
  if (e instanceof AccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

// GET /api/documents/:id — metadata + the caller's effective role.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    const role = await requireRole(session?.user?.id, id, "VIEWER", {
      notFoundOnDeny: true,
    });
    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        ownerId: true,
        state: { select: { revision: true, byteSize: true } },
      },
    });
    return NextResponse.json({ document: doc, role });
  } catch (e) {
    return handleAccessError(e);
  }
}

// PATCH /api/documents/:id — rename (editor or higher).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "EDITOR", { notFoundOnDeny: true });

    const body = await req.json().catch(() => null);
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const doc = await prisma.document.update({
      where: { id },
      data: { title: parsed.data.title },
      select: { id: true, title: true },
    });
    return NextResponse.json({ document: doc });
  } catch (e) {
    return handleAccessError(e);
  }
}

// DELETE /api/documents/:id — owner only. Cascades to state/versions/collaborators.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "OWNER", { notFoundOnDeny: true });
    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAccessError(e);
  }
}
