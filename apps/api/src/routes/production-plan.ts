import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, projects, scripts } from "@slate/db";
import { buildApiWorkflow, readCheckpoint } from "../workflow";
import { loadStoryboard } from "./storyboard";
import { sendError, ERROR_CODES } from "../error";
import { getOwnedProject } from "../hooks";
import type { AppDeps } from "../app";

// Consolidated production plan (Task 10 contract): stage (checkpoint-derived),
// productionPlanStatus, latest script, the ordered storyboard scenes, and the
// consistency records (characters/locations) in ONE payload - the done view's
// single source of truth. Owner-scoped like every /api/v1 route.
export async function productionPlanRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/projects/:id/production-plan", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");

    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    const sb = await loadStoryboard(id);
    const [script] = await db.select().from(scripts)
      .where(eq(scripts.projectId, id)).orderBy(desc(scripts.version)).limit(1);

    return {
      plan: {
        // Fresh project with no checkpoint yet → still in the idea phase.
        stage: cp.stage ?? "idea",
        productionPlanStatus: row.productionPlanStatus,
        script: script?.content ?? null,
        scenes: sb?.scenes ?? [],
        characters: row.characters ?? [],
        locations: row.locations ?? [],
      },
    };
  });
}
