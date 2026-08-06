import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, projects } from "@slate/db";
import { sendError, ERROR_CODES } from "./error";
import type { TokenVerifier } from "./auth";

// req.userId is set by the requireUser hook (enforced mode) or stays "" in
// local mode. Declared once so every route reads it typed.
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

// Plan Task 2 (ADR-022/023) owner-scoping gates.
//
// Enforced mode (verifyToken injected): every /api/v1 request must carry a
// valid `Authorization: Bearer <jwt>`; req.userId is the Clerk user id, and
// getOwnedProject returns null for anything that isn't the caller's → 404.
//
// Local/slice mode (no verifyToken): req.userId stays "" and getOwnedProject
// does NOT filter by owner — the zero-container demo and the E2E run exactly
// as before. Health is always public.

export function requireUser(verifyToken: TokenVerifier) {
  return async function requireUserHook(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token) return sendError(reply, ERROR_CODES.UNAUTHORIZED, 401, "missing bearer token");
    try {
      const { userId } = await verifyToken(token);
      req.userId = userId;
    } catch {
      return sendError(reply, ERROR_CODES.UNAUTHORIZED, 401, "invalid token");
    }
  };
}

// Load a project IF the caller may see it. userId "" (local mode) skips the
// owner check; otherwise cross-user access returns null → callers 404 (never
// 403 — avoids leaking existence, per api-design.md).
export async function getOwnedProject(userId: string, id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) return null;
  if (userId !== "" && row.ownerId !== userId) return null;
  return row;
}

// The ownerId a request writes on create: the verified user in enforced mode,
// "local" otherwise (matches the column default for zero-auth slices).
export function ownerFor(userId: string): string {
  return userId === "" ? "local" : userId;
}
