"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { FileText, Plus, LogOut, Users, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { appName } from "@/lib/site-config";
import { formatRelativeTime } from "@/lib/utils";

type Role = "OWNER" | "EDITOR" | "VIEWER";

interface DocItem {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
  owner: { name: string | null; email: string };
  collaboratorCount: number;
  versionCount: number;
}

const roleBadge: Record<Role, string> = {
  OWNER: "bg-signal-soft text-signal",
  EDITOR: "bg-warn-soft text-warn",
  VIEWER: "bg-line text-muted",
};

export function DocumentsList({ userName }: { userName: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
    } else {
      setError("Could not load documents.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createDoc() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled document" }),
    });
    setCreating(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/documents/${data.document.id}`);
    } else {
      setError("Could not create document.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="font-mono text-lg tracking-tight text-ink">
            {appName}
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {userName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl text-ink">Your documents</h2>
          <Button onClick={createDoc} disabled={creating}>
            <Plus className="h-4 w-4" />
            {creating ? "Creating…" : "New document"}
          </Button>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}

        {docs === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-3 text-ink">No documents yet</p>
            <p className="mt-1 text-sm text-muted">
              Create your first document to start writing — online or off.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {docs.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 font-medium text-ink">
                      {d.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[d.role]}`}
                    >
                      {d.role.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-faint">
                    Edited {formatRelativeTime(new Date(d.updatedAt))}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {d.collaboratorCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <History className="h-3.5 w-3.5" />
                      {d.versionCount}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
