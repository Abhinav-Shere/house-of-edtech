"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Role = "OWNER" | "EDITOR" | "VIEWER";

interface Collaborator {
  userId: string;
  role: Role;
  user: { name: string | null; email: string };
}

interface Props {
  documentId: string;
  currentRole: Role;
}

const roleBadge: Record<Role, string> = {
  OWNER: "bg-ink text-paper",
  EDITOR: "bg-signal-soft text-signal",
  VIEWER: "bg-line text-muted",
};

export function CollaboratorsPanel({ documentId, currentRole }: Props) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = currentRole === "OWNER";

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/collaborators`);
    if (res.ok) setCollaborators((await res.json()).collaborators);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/documents/${documentId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    if (res.ok) {
      setEmail("");
      await load();
    } else {
      setError((await res.json()).error ?? "Could not add collaborator");
    }
    setBusy(false);
  };

  const changeRole = async (userId: string, nextRole: Role) => {
    await fetch(`/api/documents/${documentId}/collaborators`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: nextRole }),
    });
    await load();
  };

  const remove = async (userId: string) => {
    await fetch(`/api/documents/${documentId}/collaborators?userId=${userId}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <section aria-labelledby="people-heading" className="space-y-3">
      <h2 id="people-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Users className="size-4 text-muted" aria-hidden /> People
      </h2>

      <ul className="space-y-1.5">
        {collaborators.map((c) => (
          <li key={c.userId} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-ink">{c.user.name ?? c.user.email}</p>
              <p className="truncate text-[11px] text-faint">{c.user.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isOwner && c.role !== "OWNER" ? (
                <select
                  aria-label={`Role for ${c.user.email}`}
                  value={c.role}
                  onChange={(e) => changeRole(c.userId, e.target.value as Role)}
                  className="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink"
                >
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              ) : (
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${roleBadge[c.role]}`}>
                  {c.role.toLowerCase()}
                </span>
              )}
              {isOwner && c.role !== "OWNER" && (
                <button
                  onClick={() => remove(c.userId)}
                  className="rounded p-1 text-faint hover:bg-line/60 hover:text-danger"
                  title="Remove"
                  aria-label={`Remove ${c.user.email}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-signal"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "EDITOR" | "VIEWER")}
              aria-label="Invite role"
              className="rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
          </div>
          <Button size="sm" variant="outline" onClick={invite} disabled={busy} className="w-full">
            <UserPlus className="size-3.5" aria-hidden /> Add collaborator
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
