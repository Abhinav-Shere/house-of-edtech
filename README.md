# Driftwood — Local-First Collaborative Editor

A local-first, collaborative document editor with **offline synchronization**,
**deterministic conflict resolution** (CRDT), and **granular version control**.
Built for the House of Edtech Fullstack Developer assignment.

You can open, edit, and close documents with **zero network requests blocking
the UI**. Changes are stored locally first and reconciled with the server
automatically when the connection returns — without overwriting offline work.

---

## Table of contents

1. [Stack](#stack)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Database setup](#database-setup)
5. [Running the app](#running-the-app)
6. [Demo accounts](#demo-accounts)
7. [Testing the offline flow by hand](#testing-the-offline-flow-by-hand)
8. [Automated tests](#automated-tests)
9. [Architecture](#architecture)
10. [Security & real-world considerations](#security--real-world-considerations)
11. [Deployment (Vercel + CI/CD)](#deployment-vercel--cicd)
12. [Before you submit](#before-you-submit)

---

## Stack

| Layer            | Choice                                                    |
| ---------------- | --------------------------------------------------------- |
| Framework        | **Next.js 16** (App Router, Turbopack, async request APIs) |
| Language         | **TypeScript**                                            |
| UI               | **React 19**, **Tailwind CSS v4**, lucide-react           |
| Database         | **PostgreSQL** via **Prisma ORM**                         |
| Auth             | **Auth.js (NextAuth v5)** — Credentials + JWT sessions    |
| CRDT / sync      | **Yjs** + **y-indexeddb** (local persistence)             |
| AI (optional)    | OpenAI / Groq / Gemini (pluggable provider)               |
| Tests            | **Vitest** (unit) + **Playwright** (e2e)                  |

---

## Quick start

```bash
# 1. Install dependencies (Node 20.9+ required)
npm install

# 2. Configure environment
cp .env.example .env
#   → edit .env: set DATABASE_URL and AUTH_SECRET (see below)

# 3. Create the schema and seed demo data
npm run db:push
npm run db:seed

# 4. Run
npm run dev
# open http://localhost:3000
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable                    | Required | Description                                                              |
| --------------------------- | -------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`              | yes      | PostgreSQL connection string.                                            |
| `AUTH_SECRET`               | yes      | Session signing secret. Generate with `npx auth secret` or `openssl rand -base64 32`. |
| `AUTH_URL`                  | prod     | Canonical app URL (e.g. `https://your-app.vercel.app`).                  |
| `NEXT_PUBLIC_MAX_SYNC_BYTES`| no       | Max decoded sync payload size in bytes (default `1048576` = 1 MiB).       |
| `NEXT_PUBLIC_SYNC_POLL_MS`  | no       | Background pull interval in ms (default `4000`).                          |
| `AI_PROVIDER`               | no       | `openai` \| `groq` \| `gemini`. Omit to disable AI features.             |
| `AI_API_KEY`                | no       | API key for the chosen provider.                                         |
| `AI_MODEL`                  | no       | Model id (e.g. `gpt-4o-mini`, `llama-3.1-8b-instant`).                    |

> AI is fully optional. With no `AI_API_KEY`, the AI panel hides itself and the
> `/api/ai` route returns `503` — nothing else is affected.

---

## Database setup

Any PostgreSQL 14+ works. The fastest local option is Docker:

```bash
docker run --name driftwood-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=driftwood \
  -p 5432:5432 -d postgres:16
```

Then in `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/driftwood?schema=public"
```

Apply the schema and seed:

```bash
npm run db:push     # pushes prisma/schema.prisma to the database
npm run db:seed     # creates demo users + a shared document
```

### Optional: Postgres Row-Level Security

Tenant isolation is enforced primarily through **strict ORM scoping** (every
query is filtered by the `Collaborator` join table). For defense-in-depth, you
can additionally enable Postgres RLS:

```bash
psql "$DATABASE_URL" -f prisma/rls.sql
```

See [Security](#security--real-world-considerations) for the rationale.

---

## Running the app

```bash
npm run dev        # development (Turbopack)
npm run build      # production build (runs prisma generate first)
npm start          # serve the production build
```

Useful scripts:

```bash
npm run typecheck  # tsc --noEmit
npm run db:studio  # Prisma Studio (inspect data)
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright)
```

---

## Demo accounts

After `npm run db:seed`:

| Email              | Password      | Role on the seeded doc |
| ------------------ | ------------- | ---------------------- |
| `owner@demo.test`  | `password123` | **Owner**              |
| `editor@demo.test` | `password123` | **Editor**             |
| `viewer@demo.test` | `password123` | **Viewer** (read-only) |

Sign in as the **viewer** to confirm viewers cannot push updates; sign in as the
**editor** in a second browser to watch concurrent edits merge.

---

## Testing the offline flow by hand

1. Sign in as `owner@demo.test` and open *Getting started with Driftwood*.
2. Open DevTools → **Network** → set throttling to **Offline**.
3. Type freely. Notice the UI never stalls and the connection pill turns
   amber ("offline / pending changes") with a pending count.
4. Set the network back to **Online**. The pill flushes pending changes,
   pulls any remote diff, and turns teal ("synced") with an incremented
   revision number.
5. Reload the page — your offline edits are still there, now server-backed.

To see **conflict resolution**: open the same document in two browsers (e.g. as
owner and editor), take one offline, edit in *both*, then reconnect. Both sets
of edits survive and both windows converge to the identical text.

---

## Automated tests

**Unit tests (Vitest)** — `npm test`

- `tests/unit/crdt-merge.test.ts` proves the central property: concurrent
  offline edits merge **commutatively** (order-independent), **idempotently**
  (duplicate delivery is a no-op), and **losslessly** (no contribution is
  dropped). It also covers minimal-diff encoding and safe snapshot restore.
- `tests/unit/validation.test.ts` covers the OOM payload guard, base64/shape
  validation, registration rules, AI-action allow-listing, and the role
  hierarchy.

**E2E tests (Playwright)** — `npm run test:e2e`

`tests/e2e/editor.spec.ts` drives a real browser through login, offline editing,
reconnect-and-sync, and viewer read-only enforcement. Run the app and seed first:

```bash
npm run db:seed
npm run build && npm start    # or: npm run dev
npm run test:e2e
```

---

## Architecture

### Local-first data flow

```
        ┌─────────────────────── browser ───────────────────────┐
        │                                                        │
  keystrokes → Y.Doc (CRDT) ──persist──▶ IndexedDB (y-indexeddb) │
        │            │                                           │
        │            │ "update" event (debounced 600ms)          │
        │            ▼                                            │
        │      SyncEngine ──push diff──▶                         │
        └──────────────────────────────┼─────────────────────────┘
                                        │  REST  (poll every 4s +
                                        ▼         on reconnect)
                          ┌─────────────────────────────┐
                          │  /api/documents/[id]/sync    │
                          │  validate → row-lock → merge │
                          │  → return minimal diff       │
                          └──────────────┬──────────────┘
                                         ▼
                              PostgreSQL (merged Yjs
                              update + state vector +
                              monotonic revision)
```

- **The Y.Doc *is* the source of truth.** The UI reads and writes the local
  CRDT; the network is never on the critical path. y-indexeddb persists it, so
  a full offline session survives reloads and crashes.
- **The Y.Doc + the last-known server state vector *is* the sync queue.** There
  is no separate fragile "op queue" to corrupt — the diff to push is always
  `encodeStateAsUpdate(doc, serverStateVector)`.
- **The server is a dumb, safe merge point.** It applies an opaque Yjs update
  inside a `SELECT … FOR UPDATE` transaction, re-encodes the merged state, bumps
  a revision counter, and returns the minimal diff the client is missing. It
  never needs to understand document semantics.

### Deterministic conflict resolution

Conflict resolution is delegated to **Yjs**, a well-proven CRDT. CRDT merges are
**commutative, associative, and idempotent**, which is exactly what an
offline-first system needs: clients that diverged offline always re-converge to
the same state regardless of the order updates arrive, with no data loss and no
"last write wins" clobbering. The unit tests assert these properties directly.

### Version history & safe time-travel

A *Version* is an immutable Yjs snapshot (`Bytes`) plus a label and author.
Restoring does **not** overwrite the shared document. Instead the snapshot's
text is **replayed as new CRDT operations** onto the live document, so the
restore is itself just another mergeable change — other collaborators' in-flight
edits are preserved and everyone re-converges.

### Real-time transport

Sync uses **REST over short polling + debounced push**, which works on
serverless platforms (Vercel) with no always-on socket. The push/pull contract
is diff-based (state vectors), so payloads stay small. The transport is
deliberately swappable — a `y-websocket` provider can be dropped in later for
lower latency without touching the merge logic.

---

## Security & real-world considerations

**Preventing OOM from malicious sync payloads** — defense in layers:

1. `Content-Length` is checked *before* the request body is read; oversized
   requests are rejected with `413` without buffering.
2. The base64 string length is capped in the Zod schema (`MAX_B64_LEN`), so an
   over-long payload fails validation before any decode.
3. The **decoded** byte size is checked against `MAX_SYNC_BYTES` before the
   bytes are handed to Yjs.
4. Per-user-per-document **rate limiting** caps sync frequency.

**Authentication & authorization**

- Auth.js (NextAuth v5), Credentials provider, bcrypt-hashed passwords, JWT
  (stateless) sessions. The login path runs a hash comparison even for unknown
  emails to blunt user enumeration.
- Roles **Owner / Editor / Viewer** are enforced server-side on every route via
  `requireRole`. **Viewers cannot push state** — the sync route lets them pull
  but rejects writes with `403` (`readOnly: true`).
- Denied access returns `404`, not `403`, so document ids can't be enumerated.

**Tenant isolation**

- *Primary:* strict ORM scoping. Every document/state/version/collaborator query
  is filtered through the `Collaborator` join table for the authenticated user —
  there is no code path that reads another tenant's rows.
- *Defense-in-depth:* optional Postgres **Row-Level Security** (`prisma/rls.sql`)
  using a per-request `app.current_user_id` setting, so even a future buggy query
  can't cross tenant boundaries.

**Document state growth over time** — Yjs state is compacted on each merge
(`encodeStateAsUpdate` of the merged doc rather than an ever-growing op log), and
`byteSize` is tracked per document so growth is observable and enforceable.

---

## Deployment (Vercel + CI/CD)

1. Push the repo to GitHub.
2. Provision a PostgreSQL database (Neon, Supabase, Vercel Postgres, RDS…).
3. Import the repo into **Vercel**.
4. Set environment variables in the Vercel dashboard: `DATABASE_URL`,
   `AUTH_SECRET`, `AUTH_URL` (your deployment URL), and any `AI_*` keys.
5. Run the schema push against the production DB once:
   `DATABASE_URL=… npm run db:push` (and `db:seed` if you want demo data).
6. Deploy. The build command (`prisma generate && next build`) runs automatically.

**CI/CD** is configured in `.github/workflows/ci.yml`: every push / PR to `main`
runs typecheck → unit tests → production build. Vercel's GitHub integration
handles preview and production deploys on top of that.

---

## Before you submit

- [ ] Replace the placeholder author details in **`src/lib/site-config.ts`**
      (name, GitHub URL, LinkedIn URL) — these render in the required footer.
- [ ] Set a strong `AUTH_SECRET` in production.
- [ ] Point `DATABASE_URL` at your hosted PostgreSQL.
- [ ] (Optional) Add an `AI_API_KEY` to enable the AI panel.

---

## Project layout

```
prisma/
  schema.prisma         # User, Document, DocumentState, Collaborator, Version
  rls.sql               # optional Row-Level Security policies
  seed.ts               # demo users + shared document
src/
  app/
    api/                # auth, documents, sync, versions, collaborators, ai
    documents/          # list + [id] workspace pages
    login/ register/    # auth pages
  components/           # editor, connection-status pill, panels, footer
  hooks/                # use-sync, use-online
  lib/
    local/              # ydoc, db (IndexedDB meta), sync-engine  ← local-first core
    server/             # ydoc-merge  ← server merge point
    auth.ts rbac.ts validation.ts rate-limit.ts ai/
tests/
  unit/                 # Vitest: CRDT merge + validation/RBAC
  e2e/                  # Playwright: offline edit + reconnect
```
