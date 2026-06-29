import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as Y from "yjs";

const prisma = new PrismaClient();

/**
 * Seeds three demo users (owner / editor / viewer) and one shared document so
 * you can immediately exercise every role and the offline-sync flow.
 *
 *   owner@demo.test    / password123   (OWNER)
 *   editor@demo.test   / password123   (EDITOR)
 *   viewer@demo.test   / password123   (VIEWER — cannot push updates)
 */
async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const [owner, editor, viewer] = await Promise.all([
    prisma.user.upsert({
      where: { email: "owner@demo.test" },
      update: {},
      create: { email: "owner@demo.test", name: "Olivia Owner", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "editor@demo.test" },
      update: {},
      create: { email: "editor@demo.test", name: "Eddie Editor", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "viewer@demo.test" },
      update: {},
      create: { email: "viewer@demo.test", name: "Vera Viewer", passwordHash },
    }),
  ]);

  // Build an initial CRDT document with some starter text.
  const doc = new Y.Doc();
  doc.getText("content").insert(
    0,
    "Welcome to Driftwood.\n\n" +
      "This document is local-first: edit it offline and your changes sync " +
      "automatically when you reconnect. Try going offline (DevTools → Network → " +
      "Offline), typing a few lines, then coming back online to watch the pill " +
      "turn teal.\n",
  );
  const update = Y.encodeStateAsUpdate(doc);
  const stateVector = Y.encodeStateVector(doc);

  const existing = await prisma.document.findFirst({
    where: { title: "Getting started with Driftwood", ownerId: owner.id },
  });

  if (!existing) {
    await prisma.document.create({
      data: {
        title: "Getting started with Driftwood",
        ownerId: owner.id,
        state: {
          create: {
            update: Buffer.from(update),
            stateVector: Buffer.from(stateVector),
            revision: 1,
            byteSize: update.byteLength,
          },
        },
        collaborators: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: editor.id, role: "EDITOR" },
            { userId: viewer.id, role: "VIEWER" },
          ],
        },
        versions: {
          create: {
            label: "Initial draft",
            snapshot: Buffer.from(update),
            byteSize: update.byteLength,
            createdById: owner.id,
          },
        },
      },
    });
  }

  console.log("Seed complete.");
  console.log("  owner@demo.test  / password123  (OWNER)");
  console.log("  editor@demo.test / password123  (EDITOR)");
  console.log("  viewer@demo.test / password123  (VIEWER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
