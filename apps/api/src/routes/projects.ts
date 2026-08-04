import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, projects } from "@slate/db";
import { buildApiWorkflow, readCheckpoint, resumeWorkflow } from "../workflow";
import { sendError, ApiError, ERROR_CODES } from "../error";
import type { AppDeps } from "../app";

export async function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/projects", async (req, reply) => {
    const { idea } = (req.body ?? {}) as { idea?: string };
    if (!idea || typeof idea !== "string" || idea.trim().length === 0) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "idea is required");
    }
    const id = randomUUID();
    await db.insert(projects).values({ id, idea: idea.trim(), conversation: [], briefHistory: [] });
    // Run the workflow synchronously to its first interrupt (the script gate).
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    await graph.invoke({ projectId: id }, { configurable: { thread_id: id } });
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new ApiError(ERROR_CODES.NOT_FOUND, 404, "project not found");
    const cp = await readCheckpoint(graph, id);
    return reply.code(201).send({ project: { ...row, stage: cp.stage } });
  });

  app.get("/api/v1/projects", async () => {
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return { projects: rows };
  });

  app.get("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    return { project: { ...row, stage: cp.stage } };
  });

  // Creative Discovery: answer the planning agent's interview questions.
  app.post("/api/v1/projects/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { content?: string };
    if (!body.content || typeof body.content !== "string") {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "content is required");
    }
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    if (!cp.pendingGates.includes("discovery_questions")) {
      return sendError(reply, ERROR_CODES.CONFLICT, 409, "no pending interview question for this project");
    }
    await resumeWorkflow(graph, id, [body.content]);
    return { ok: true };
  });
}
