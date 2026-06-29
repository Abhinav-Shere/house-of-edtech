import { z } from "zod";

/**
 * Central validation. Every byte that crosses the network boundary is checked
 * here BEFORE it is parsed into objects or fed to Yjs. This is the first line
 * of defense against malformed-payload / OOM attacks.
 */

// Hard ceiling on a single sync payload (base64 of a Yjs update). Anything
// larger is rejected at the edge — we never allocate or decode it. Default 1 MiB.
export const MAX_SYNC_BYTES = Number(
  process.env.NEXT_PUBLIC_MAX_SYNC_BYTES ?? 1_048_576,
);

// Practical ceiling on a base64 string length given MAX_SYNC_BYTES of raw data.
// base64 inflates by ~4/3; add slack for padding/whitespace.
export const MAX_B64_LEN = Math.ceil((MAX_SYNC_BYTES * 4) / 3) + 16;

export const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200, "That password is too long"),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled document"),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

// A base64-encoded Yjs binary blob. We cap the *string* length up front so a
// 500 MB body never gets buffered into memory before we look at it.
const base64Blob = z
  .string()
  .min(1)
  .max(MAX_B64_LEN, "Sync payload exceeds the maximum allowed size")
  .regex(/^[A-Za-z0-9+/=]+$/, "Payload must be valid base64");

export const syncSchema = z.object({
  // The client's local changes since its last successful sync.
  update: base64Blob.optional(),
  // The client's current state vector — lets the server return a minimal diff.
  stateVector: base64Blob.optional(),
  // Client's last-seen server revision, for a cheap "is there anything new?" check.
  knownRevision: z.number().int().nonnegative().optional(),
});

export const createVersionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  // Full document snapshot encoded as a Yjs update (base64).
  snapshot: base64Blob,
});

const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;

export const addCollaboratorSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const updateCollaboratorSchema = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(ROLES),
});

export const aiActionSchema = z.object({
  action: z.enum(["summarize", "improve", "continue", "title"]),
  // The relevant slice of document text. Capped so we never forward an
  // unbounded prompt to the model provider.
  text: z.string().min(1).max(20_000),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SyncInput = z.infer<typeof syncSchema>;
export type AiAction = z.infer<typeof aiActionSchema>["action"];
