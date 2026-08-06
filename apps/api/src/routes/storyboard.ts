import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, projects, storyboards, scenes } from "@slate/db";
import { buildApiWorkflow, readCheckpoint } from "../workflow";
import { sendError, ERROR_CODES } from "../error";
import { getOwnedProject } from "../hooks";
import type { AppDeps } from "../app";

interface SceneView {
  id: string;
  order: number;
  content: { title: string; narration: string; visualDescription: string; cameraDirection: string; durationSeconds: number; transition: string; musicCue: string };
  promptPack: { imagePrompt: string; videoPrompt: string; narrationPrompt: string; musicPrompt: string; sfxPrompt: string } | null;
}

interface StoryboardView {
  version: number;
  status: "draft" | "approved";
  scenes: SceneView[];
}

// Latest storyboard + its scene rows for a project (version rows model: the
// latest (storyboard_id, order) is the current scene — spec §12.9).
export async function loadStoryboard(id: string): Promise<StoryboardView | null> {
  const [sb] = await db.select().from(storyboards)
    .where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
  if (!sb) return null;
  const rows = await db.select().from(scenes)
    .where(eq(scenes.storyboardId, sb.id)).orderBy(scenes.order);
  return {
    version: sb.version,
    status: "draft",
    scenes: rows.map((r) => ({
      id: r.id,
      order: r.order,
      content: r.content,
      promptPack: r.promptPack ?? null,
    })),
  };
}

export async function storyboardRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/projects/:id/storyboard", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const sb = await loadStoryboard(id);
    // null, not 404: the workspace polls this on every refresh and expects the
    // storyboard to simply not exist yet before the script is approved.
    if (!sb) return { storyboard: null };
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    return { storyboard: { ...sb, status: cp.stage === "done" ? "approved" : "draft" } };
  });

  // Atomic reorder: validate scene_ids is a permutation of the current scenes,
  // then insert a NEW storyboard version + scene rows (content + prompt pack
  // carried into the new rows). Direct-DB write, outside the gate path — the
  // plan's Task 12 reorder-atomicity requirement.
  app.put("/api/v1/projects/:id/storyboard/order", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { scene_ids?: unknown };
    if (!Array.isArray(body.scene_ids) || !body.scene_ids.every((s) => typeof s === "string")) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "scene_ids must be an array of strings");
    }
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const [sb] = await db.select().from(storyboards)
      .where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
    if (!sb) return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard yet for this project");
    const current = await db.select().from(scenes).where(eq(scenes.storyboardId, sb.id)).orderBy(scenes.order);

    const ids = body.scene_ids as string[];
    const currentIds = new Set(current.map((s) => s.id));
    const validPermutation = ids.length === current.length && ids.every((x) => currentIds.has(x)) && new Set(ids).size === ids.length;
    if (!validPermutation) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "scene_ids must be a permutation of the current scene ids");
    }

    const byId = new Map(current.map((s) => [s.id, s]));
    const version = sb.version + 1;
    const newSbId = randomUUID();
    // Atomic reorder (plan Task 12): drizzle's async db.transaction() with the
    // node-postgres driver — auto-rollback on throw, nested-transaction-safe.
    await db.transaction(async (tx) => {
      await tx.insert(storyboards).values({ id: newSbId, projectId: id, version });
      await tx.insert(scenes).values(
        ids.map((sceneId, i) => {
          const src = byId.get(sceneId)!;
          return {
            id: randomUUID(),
            storyboardId: newSbId,
            order: i + 1,
            version,
            title: src.content.title,
            content: src.content,
            promptPack: src.promptPack,
          };
        }),
      );
    });

    const after = await loadStoryboard(id);
    return { storyboard: after };
  });
}
