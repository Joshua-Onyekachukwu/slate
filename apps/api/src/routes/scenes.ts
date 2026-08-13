import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, storyboards, scenes } from "@slate/db";
import { SceneContentSchema } from "@slate/shared";
import { loadStoryboard } from "./storyboard";
import { getOwnedProject } from "../hooks";
import { sendError, ERROR_CODES } from "../error";
import type { AppDeps } from "../app";

// Per-scene editing (plan Task 10 contract: PUT /projects/:id/scenes/:sceneId
// → { content } → NEW VERSION ROW). Same version-rows model as the reorder: a
// scene edit bumps the whole storyboard version and rewrites every scene row at
// the new version with the edited content swapped in - keeping the invariant
// "latest (storyboard_id, order) is the current scene" and preserving order,
// other scenes, and prompt packs. Direct-DB write, outside the gate path.
export async function sceneRoutes(app: FastifyInstance, _deps: AppDeps) {
  app.put("/api/v1/projects/:id/scenes/:sceneId", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");

    const [sb] = await db.select().from(storyboards)
      .where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
    if (!sb) return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard yet for this project");

    const current = await db.select().from(scenes).where(eq(scenes.storyboardId, sb.id)).orderBy(scenes.order);
    const target = current.find((s) => s.id === sceneId);
    if (!target) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "scene not found");

    const body = (req.body ?? {}) as { content?: unknown };
    const parsed = SceneContentSchema.safeParse(body.content);
    if (!parsed.success) return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "content must be a valid scene");

    const version = sb.version + 1;
    const newSbId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(storyboards).values({ id: newSbId, projectId: id, version });
      await tx.insert(scenes).values(
        current.map((s) => ({
          id: randomUUID(),
          storyboardId: newSbId,
          order: s.order,
          version,
          title: (s.id === sceneId ? parsed.data : s.content).title,
          content: s.id === sceneId ? parsed.data : s.content,
          // The edited scene's pack no longer matches its content - null it so
          // the UI shows "Prompt pack queued." instead of stale prompts (the
          // prompts/regenerate endpoint re-creates it; spec §12.9).
          promptPack: s.id === sceneId ? null : s.promptPack,
        })),
      );
    });

    const storyboard = await loadStoryboard(id);
    return { storyboard };
  });
}
