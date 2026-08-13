import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./components/nav";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthBridge } from "./components/auth-bridge";
import { authEnabled } from "./lib/auth-enabled";

// Auth (Task 2, ADR-022/023) is ENV-GATED to preserve the local-first slice:
// with no Clerk keys the app renders exactly as before (E2E + zero-key demo);
// with BOTH keys present, Clerk owns identity, the middleware protects routes,
// and the API runs in enforced mode. The gate lives in lib/auth-enabled.ts
// (single source of truth) and is passed down - client components can't read
// CLERK_SECRET_KEY.

export const metadata: Metadata = {
  title: "Slate - The Cutting Room",
  description:
    "AI creative studio - turn an idea into an approved, editable production plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700&f[]=general-sans@400,500,600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {authEnabled ? (
          <ClerkProvider>
            <Nav authEnabled />
            <AuthBridge />
            {children}
          </ClerkProvider>
        ) : (
          <>
            <Nav authEnabled={false} />
            {children}
          </>
        )}
      </body>
    </html>
  );
}
