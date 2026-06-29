import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage of the local-first sync engine — the assignment's core.
 *
 * Run against a live app with the seed data loaded:
 *   npm run db:seed
 *   npm run build && npm start   (or npm run dev)
 *   npm run test:e2e
 *
 * Demo credentials come from prisma/seed.ts.
 */

const OWNER = { email: "owner@demo.test", password: "password123" };

async function login(page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/documents");
}

test("owner can sign in and open the seeded document", async ({ page }) => {
  await login(page, OWNER);
  await expect(
    page.getByText("Getting started with Driftwood"),
  ).toBeVisible();
  await page.getByText("Getting started with Driftwood").click();
  await page.waitForURL("**/documents/**");
  await expect(page.getByRole("textbox")).toBeVisible();
});

test("edits persist locally while offline and sync on reconnect", async ({
  page,
  context,
}) => {
  await login(page, OWNER);
  await page.getByText("Getting started with Driftwood").click();
  await page.waitForURL("**/documents/**");

  const editor = page.getByRole("textbox").first();
  await editor.click();

  // Go offline — the UI must stay fully responsive.
  await context.setOffline(true);
  const marker = ` [offline-${Date.now()}]`;
  await editor.press("End");
  await editor.type(marker);

  // The connection pill should reflect the offline / pending state.
  await expect(page.getByText(/offline|pending/i)).toBeVisible();

  // The typed text is present immediately, with no network round-trip.
  await expect(editor).toContainText(marker);

  // Reconnect — the engine should flush pending changes and reach "synced".
  await context.setOffline(false);
  await expect(page.getByText(/synced|saved/i)).toBeVisible({ timeout: 15_000 });

  // Reload from scratch: the offline edit survived the sync round-trip.
  await page.reload();
  await expect(page.getByRole("textbox").first()).toContainText(marker, {
    timeout: 15_000,
  });
});

test("viewer cannot edit the document", async ({ page }) => {
  await login(page, { email: "viewer@demo.test", password: "password123" });
  await page.getByText("Getting started with Driftwood").click();
  await page.waitForURL("**/documents/**");
  // The editor surface is read-only for viewers.
  const editor = page.getByRole("textbox").first();
  await expect(editor).toHaveAttribute("readonly", /.*/);
});
