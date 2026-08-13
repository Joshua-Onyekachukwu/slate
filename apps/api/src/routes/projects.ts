import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, projects } from "@slate/db";
import { buildApiWorkflow, readCheckpoint, resumeWorkflow } from "../workflow";
import { sendError, ApiError, ERROR_CODES } from "../error";
import { getOwnedProject, ownerFor } from "../hooks";
import type { AppDeps } from "../app";

// Studio production modes (openart-design §4). The selected mode becomes part
// of the creative direction handed to the planning agent: the stored idea reads
// "Essay: …" so the brief, script, and plan all carry the mode for real
// providers, and the project card shows it. Local demo mode (FakeProvider)
// ignores the idea content by design, so the deterministic queue is unaffected.
export const PRODUCTION_MODES = ["Film", "Essay", "Explainer", "Ad"] as const;

function composeIdea(idea: string, mode?: string): string {
  const label = PRODUCTION_MODES.find((m) => m.toLowerCase() === (mode ?? "").trim().toLowerCase());
  return label ? `${label}: ${idea}` : idea;
}

export async function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/projects", async (req, reply) => {
    const { idea, mode } = (req.body ?? {}) as { idea?: string; mode?: string };
    if (!idea || typeof idea !== "string" || idea.trim().length === 0) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "idea is required");
    }
    const id = randomUUID();
    await db.insert(projects).values({ id, idea: composeIdea(idea.trim(), mode), conversation: [], briefHistory: [], ownerId: ownerFor(req.userId) });
    // Run the workflow synchronously to its first interrupt (the script gate).
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    await graph.invoke({ projectId: id }, { configurable: { thread_id: id } });
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new ApiError(ERROR_CODES.NOT_FOUND, 404, "project not found");
    const cp = await readCheckpoint(graph, id);
    return reply.code(201).send({ project: { ...row, stage: cp.stage } });
  });

  app.get("/api/v1/projects", async (req) => {
    // Enforced mode: only my rows. Local mode (req.userId === ""): everything.
    const rows = req.userId === ""
      ? await db.select().from(projects).orderBy(desc(projects.updatedAt))
      : await db.select().from(projects).where(eq(projects.ownerId, req.userId)).orderBy(desc(projects.updatedAt));
    // Same checkpoint-vs-column rule as the single-project route: the projects
    // column only ever records "discovery"/"brief" (lazily patched by the
    // workflow), so the dashboard would show stale stages without this.
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const withStage = await Promise.all(
      rows.map(async (row) => {
        const cp = await readCheckpoint(graph, row.id);
        return { ...row, stage: cp.stage };
      }),
    );
    return { projects: withStage };
  });

  app.get("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    // pendingGates lets the workspace render the creative-discovery chat: when
    // the planning agent paused with "discovery_questions", the panel swaps to
    // the interview view (the stage column is still undefined at that point).
    return { project: { ...row, stage: cp.stage, pendingGates: cp.pendingGates } };
  });

  // Creative Discovery: answer the planning agent's interview questions.
  app.post("/api/v1/projects/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { content?: string };
    if (!body.content || typeof body.content !== "string") {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "content is required");
    }
    const row = await getOwnedProject(req.userId, id);
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
