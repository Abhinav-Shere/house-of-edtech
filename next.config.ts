import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yjs / lib0 ship ESM; keep them external-friendly and tree-shaken.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Hard cap on request body parsing happens in route handlers (see lib/validation),
  // this is an extra defense-in-depth limit for Server Actions payloads.
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
