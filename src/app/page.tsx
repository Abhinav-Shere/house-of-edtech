import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// The app has no marketing surface — route straight to the workspace or login.
export default async function Home() {
  const session = await auth();
  redirect(session?.user?.id ? "/documents" : "/login");
}
