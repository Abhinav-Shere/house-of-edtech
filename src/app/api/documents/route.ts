import { NextResponse } from "next/server";
import * as Y from "yjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDocumentSchema } from "@/lib/validation";

// GET /api/documents — list every document the caller can access.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const collabs = await prisma.collaborator.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      document: {
        select: {
          id: true,
          title: true,
          updatedAt: true,
          owner: { select: { name: true, email: true } },
          _count: { select: { collaborators: true, versions: true } },
        },
      },
    },
    orderBy: { document: { updatedAt: "desc" } },
  });

  const documents = collabs.map((c) => ({
    id: c.document.id,
    title: c.document.title,
    updatedAt: c.document.updatedAt,
    role: c.role,
    owner: c.document.owner,
    collaboratorCount: c.document._count.collaborators,
    versionCount: c.document._count.versions,
  }));

  return NextResponse.json({ documents });
}

// POST /api/documents — create a new document; caller becomes OWNER.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Seed an empty CRDT document so sync has a baseline to diff against.
  const emptyDoc = new Y.Doc();
  const update = Y.encodeStateAsUpdate(emptyDoc);
  const stateVector = Y.encodeStateVector(emptyDoc);

  const doc = await prisma.document.create({
    data: {
      title: parsed.data.title,
      ownerId: session.user.id,
      collaborators: {
        create: { userId: session.user.id, role: "OWNER" },
      },
      state: {
        create: {
          update: Buffer.from(update),
          stateVector: Buffer.from(stateVector),
          revision: 0,
          byteSize: update.byteLength,
        },
      },
    },
    select: { id: true, title: true },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
