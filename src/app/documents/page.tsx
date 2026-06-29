import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentsList } from "@/components/documents-list";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=/documents");

  return (
    <DocumentsList
      userName={session.user.name ?? session.user.email ?? "You"}
    />
  );
}
