"use client";

import { SignIn, SignUp } from "@clerk/nextjs";

// Auth is env-gated (ADR-022/023): the SERVER pages decide `enabled` (both
// Clerk keys present, same source of truth as layout.tsx) and pass it in.
// Without keys we render a note so visiting /sign-in never crashes  - 
// ClerkProvider and <SignIn/> would throw.

// Cutting Room appearance - map the approved token sheet (globals.css) onto
// Clerk's components: dark surface, tungsten primary, 2px radius, mono accents.
const clerkAppearance = {
  variables: {
    colorBackground: "var(--surface)",
    colorPrimary: "var(--tungsten)",
    colorText: "var(--paper)",
    colorTextSecondary: "var(--ash)",
    colorInputBackground: "var(--ink)",
    colorInputText: "var(--paper)",
    borderRadius: "2px",
    fontFamily: "var(--font-body)",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid var(--line-dark)" },
    headerTitle: { fontFamily: "var(--font-display)", letterSpacing: "0.01em" },
    formButtonPrimary: { background: "var(--tungsten)", color: "var(--ink)", fontWeight: 600 },
    formButtonPrimary__blocked: { background: "var(--ash)" },
    footerActionLink: { color: "var(--tungsten)" },
    dividerLine: { background: "var(--line-dark)" },
  },
};

export function AuthScreen({ mode, enabled }: { mode: "sign-in" | "sign-up"; enabled: boolean }) {
  const Comp = mode === "sign-in" ? SignIn : SignUp;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="bracket tl"></span>
        <span className="bracket tr"></span>
        <span className="bracket bl"></span>
        <span className="bracket br"></span>

        <div className="auth-brand">
          <span className="rec-dot"></span> slate
        </div>
        <div className="auth-lbl">
          {mode === "sign-in" ? "Sign in · cutting room" : "Open a new production"}
        </div>

        {enabled ? (
          <Comp appearance={clerkAppearance} />
        ) : (
          <p className="auth-note">
            Auth isn&apos;t configured yet - add{" "}
            <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
            <code>CLERK_SECRET_KEY</code> to <code>.env</code> to enable sign-in.
          </p>
        )}
      </section>
    </main>
  );
}
