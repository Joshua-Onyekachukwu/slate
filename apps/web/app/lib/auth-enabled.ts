// Single source of truth for the auth-enabled gate (Task 2, ADR-022/023).
//
// Auth is on only when BOTH Clerk keys are present: @clerk/nextjs v7 throws
// "Missing secretKey" if only the publishable key is set, and client
// components can't read CLERK_SECRET_KEY at all — so the gate is decided here
// on the server (and in Edge middleware) and passed down as props.
//
// MUST stay dependency-free: middleware bundles this module for the Edge
// runtime, where server-only deps would break the build.
export const authEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);
