import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/session-provider";
import { appName, appTagline } from "@/lib/site-config";

export const metadata: Metadata = {
  title: { default: `${appName} — ${appTagline}`, template: `%s · ${appName}` },
  description:
    "Write offline, sync deterministically, and travel through every version. A local-first collaborative document editor.",
  applicationName: appName,
};

export const viewport: Viewport = {
  themeColor: "#11192b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
