import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, projects, scripts } from "@slate/db";
import { sendError, ERROR_CODES } from "../error";
import { getOwnedProject, UUID_RE } from "../hooks";
import type { AppDeps } from "../app";

export async function scriptRoutes(app: FastifyInstance, _deps: AppDeps) {
  app.get("/api/v1/projects/:id/scripts", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const versions = await db.select().from(scripts).where(eq(scripts.projectId, id)).orderBy(desc(scripts.version));
    return { versions };
  });

  // Save user edits as a NEW version row (created_by: "user"); rollback = PUT an older content.
  app.put("/api/v1/projects/:id/scripts/:scriptId/versions", async (req, reply) => {
    const { id, scriptId } = req.params as { id: string; scriptId: string };
    const body = (req.body ?? {}) as { content?: unknown };
    if (!body.content || typeof body.content !== "object") {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "content object is required");
    }
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    // The edited script row must exist and belong to this project — a made-up
    // scriptId should 404, not silently create a version under it. Postgres uuid
    // PK: garbage scriptId would be a cast error → 500 (same fix as getOwnedProject).
    if (!UUID_RE.test(scriptId)) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "script not found");
    const [target] = await db.select().from(scripts).where(eq(scripts.id, scriptId));
    if (!target || target.projectId !== id) {
      return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "script not found");
    }
    const [latest] = await db.select().from(scripts).where(eq(scripts.projectId, id)).orderBy(desc(scripts.version)).limit(1);
    const version = (latest?.version ?? 0) + 1;
    await db.insert(scripts).values({
      id: randomUUID(),
      projectId: id,
      version,
      content: body.content as never,
      createdBy: "user",
    });
    return reply.code(201).send({ version, scriptId });
  });
}
