import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { aiActionSchema } from "@/lib/validation";
import { isAiEnabled, runAi } from "@/lib/ai/provider";

// GET /api/ai — capability probe so the UI can hide AI features when unconfigured.
export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}

// POST /api/ai — run an AI action over a slice of document text.
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "AI features are not enabled on this deployment." },
      { status: 503 },
    );
  }

  // AI calls are expensive — keep them on a tight leash per user.
  if (!rateLimit(`ai:${userId}`, 20, 60_000).ok) {
    return NextResponse.json(
      { error: "AI rate limit reached. Try again in a minute." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = aiActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const { text } = await runAi(parsed.data.action, parsed.data.text);
    return NextResponse.json({ result: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
