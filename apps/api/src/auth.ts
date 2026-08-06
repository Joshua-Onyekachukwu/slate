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
