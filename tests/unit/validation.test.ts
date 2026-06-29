import { describe, it, expect } from "vitest";
import {
  syncSchema,
  registerSchema,
  aiActionSchema,
  MAX_B64_LEN,
} from "@/lib/validation";
import { atLeast } from "@/lib/rbac";

describe("sync payload validation (OOM mitigation)", () => {
  it("accepts a small, well-formed base64 update", () => {
    const r = syncSchema.safeParse({
      update: Buffer.from("hello").toString("base64"),
      knownRevision: 3,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an oversized payload before it is ever decoded", () => {
    const huge = "A".repeat(MAX_B64_LEN + 1);
    const r = syncSchema.safeParse({ update: huge });
    expect(r.success).toBe(false);
  });

  it("rejects non-base64 garbage", () => {
    const r = syncSchema.safeParse({ update: "not valid base64 !!!" });
    expect(r.success).toBe(false);
  });

  it("rejects a negative revision", () => {
    const r = syncSchema.safeParse({ knownRevision: -1 });
    expect(r.success).toBe(false);
  });
});

describe("registration validation", () => {
  it("requires an 8+ character password", () => {
    expect(
      registerSchema.safeParse({
        name: "A",
        email: "a@b.co",
        password: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(
      registerSchema.safeParse({
        name: "A",
        email: "nope",
        password: "longenough",
      }).success,
    ).toBe(false);
  });
});

describe("AI action validation", () => {
  it("only allows known actions", () => {
    expect(
      aiActionSchema.safeParse({ action: "summarize", content: "x" }).success,
    ).toBe(true);
    expect(
      aiActionSchema.safeParse({ action: "delete_all", content: "x" }).success,
    ).toBe(false);
  });
});

describe("role hierarchy", () => {
  it("ranks OWNER > EDITOR > VIEWER", () => {
    expect(atLeast("OWNER", "EDITOR")).toBe(true);
    expect(atLeast("EDITOR", "EDITOR")).toBe(true);
    expect(atLeast("VIEWER", "EDITOR")).toBe(false);
    expect(atLeast("VIEWER", "VIEWER")).toBe(true);
  });
});
