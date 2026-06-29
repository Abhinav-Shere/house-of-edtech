import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/rbac";
import { DocumentWorkspace } from "@/components/document-workspace";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?from=/documents/${id}`);

  // Authorize on the server before rendering anything. A user with no role on
  // this document gets a 404 (not 403) so document ids can't be enumerated.
  const role = await getRole(session.user.id, id);
  if (!role) notFound();

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!doc) notFound();

  return (
    <DocumentWorkspace
      documentId={doc.id}
      initialTitle={doc.title}
      role={role}
    />
  );
}
