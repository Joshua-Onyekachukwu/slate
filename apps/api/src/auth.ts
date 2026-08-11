import { verifyToken } from "@clerk/backend";

// Plan Task 2 (ADR-022/023): Clerk owns identity; this module verifies Clerk
// JWTs and exposes the user id (user_...) routes scope by. The verifier is
// INJECTABLE so tests substitute a fake (auth.test.ts) and never call Clerk.
export type TokenVerifier = (token: string) => Promise<{ userId: string }>;

export function makeVerifyToken(secretKey = process.env.CLERK_SECRET_KEY): TokenVerifier {
  if (!secretKey) {
    // Fail fast at boot, not on the first request: enforced auth mode with no
    // key is a misconfiguration.
    throw new Error("CLERK_SECRET_KEY is required to verify Clerk tokens");
  }
  return async (token: string) => {
    const payload = await verifyToken(token, { secretKey });
    return { userId: payload.sub as string };
  };
}

// Hermetic E2E stub (tests/playwright.auth.config.ts): maps fixed bearer tokens
// to fixed user ids so enforced-mode auth + owner isolation can be exercised
// end-to-end WITHOUT Clerk. Enabled ONLY by STUB_AUTH=1 (a test-only env var
// never set in production/CI); the two-token map also proves multi-user
// isolation at the E2E layer (user B cannot see user A's rows → 404).
export const STUB_USERS: Record<string, string> = {
  "stub-token-a": "user_stub_a",
  "stub-token-b": "user_stub_b",
};

export function makeStubVerifyToken(users: Record<string, string> = STUB_USERS): TokenVerifier {
  return async (token: string) => {
    const userId = users[token];
    if (!userId) throw new Error(`unknown stub token`);
    return { userId };
  };
}
