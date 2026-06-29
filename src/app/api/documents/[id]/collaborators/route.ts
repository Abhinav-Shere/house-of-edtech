import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccessError, requireRole } from "@/lib/rbac";
import {
  addCollaboratorSchema,
  updateCollaboratorSchema,
} from "@/lib/validation";

function fail(e: unknown) {
  if (e instanceof AccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

// GET — list collaborators (any member can view the roster).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "VIEWER", { notFoundOnDeny: true });
    const collaborators = await prisma.collaborator.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
    });
    return NextResponse.json({ collaborators });
  } catch (e) {
    return fail(e);
  }
}

// POST — invite a user by email as EDITOR or VIEWER (owner only).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "OWNER", { notFoundOnDeny: true });

    const body = await req.json().catch(() => null);
    const parsed = addCollaboratorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "No account with that email. Ask them to sign up first." },
        { status: 404 },
      );
    }

    const collaborator = await prisma.collaborator.upsert({
      where: { documentId_userId: { documentId: id, userId: user.id } },
      create: { documentId: id, userId: user.id, role: parsed.data.role },
      update: { role: parsed.data.role },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ collaborator }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// PATCH — change a collaborator's role (owner only). Owner role is protected.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "OWNER", { notFoundOnDeny: true });

    const body = await req.json().catch(() => null);
    const parsed = updateCollaboratorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const target = await prisma.collaborator.findUnique({
      where: { documentId_userId: { documentId: id, userId: parsed.data.userId } },
    });
    if (!target) {
      return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
    }
    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "The owner role can't be changed here." },
        { status: 400 },
      );
    }

    const collaborator = await prisma.collaborator.update({
      where: { documentId_userId: { documentId: id, userId: parsed.data.userId } },
      data: { role: parsed.data.role },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ collaborator });
  } catch (e) {
    return fail(e);
  }
}

// DELETE — remove a collaborator (owner only; owner can't remove themselves).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  try {
    await requireRole(session?.user?.id, id, "OWNER", { notFoundOnDeny: true });
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const target = await prisma.collaborator.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
    });
    if (target?.role === "OWNER") {
      return NextResponse.json(
        { error: "You can't remove the document owner." },
        { status: 400 },
      );
    }

    await prisma.collaborator.deleteMany({ where: { documentId: id, userId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
