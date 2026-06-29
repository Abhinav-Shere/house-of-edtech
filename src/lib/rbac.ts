import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Role-based access control.
 *
 * The single source of truth for "can this user do X to this document" is the
 * Collaborator table. Every privileged route resolves the caller's role here
 * and refuses anything the role doesn't permit. Viewers, in particular, can
 * read but can NEVER push state updates.
 */

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

/** Returns the caller's role for a document, or null if they have no access. */
export async function getRole(
  userId: string,
  documentId: string,
): Promise<Role | null> {
  const collab = await prisma.collaborator.findUnique({
    where: { documentId_userId: { documentId, userId } },
    select: { role: true },
  });
  return collab?.role ?? null;
}

export class AccessError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/**
 * Resolve and assert access in one call. Throws AccessError on failure so route
 * handlers can map it to a clean HTTP response.
 *
 * `notFoundOnDeny` hides the existence of documents the user can't see — we
 * return 404 rather than 403 so an attacker can't enumerate document ids.
 */
export async function requireRole(
  userId: string | undefined,
  documentId: string,
  minimum: Role,
  opts: { notFoundOnDeny?: boolean } = {},
): Promise<Role> {
  if (!userId) throw new AccessError(401, "Not authenticated");

  const role = await getRole(userId, documentId);
  if (!role) {
    throw new AccessError(opts.notFoundOnDeny ? 404 : 403, "Document not found");
  }
  if (!atLeast(role, minimum)) {
    throw new AccessError(403, `Requires ${minimum.toLowerCase()} access`);
  }
  return role;
}
