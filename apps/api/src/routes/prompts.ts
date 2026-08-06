import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, sqlite, storyboards, scenes } from "@slate/db";
import { promptAgent } from "@slate/ai";
import type { Character, Location } from "@slate/shared";
import { loadStoryboard } from "./storyboard";
import { getOwnedProject } from "../hooks";
import { sendError, ERROR_CODES } from "../error";
import type { AppDeps } from "../app";

// Per-scene prompt regeneration (plan Task 10 contract: POST
// /projects/:id/scenes/:sceneId/prompts/regenerate → new scene version). Follows
// the slice's proven version-rows model (edit/reorder): one atomic transaction
// bumps the WHOLE storyboard version and rewrites every scene row at the new
// version, swapping in the regenerated pack for the target scene and carrying
// content/order/other packs — keeping "latest (storyboard_id, order) is the
// current scene" (spec §12.9). The pack comes from promptAgent threaded with the
// project's stored characters/locations (same inputs as the workflow's prompt_gen
// node, so continuity holds). Direct-DB write, outside the gate path — the plan's
// one-mutation-path guarantee explicitly doesn't apply to per-scene writes.
export async function promptRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/projects/:id/scenes/:sceneId/prompts/regenerate", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");

    const [sb] = await db.select().from(storyboards)
      .where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
    if (!sb) return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard yet for this project");

    const current = await db.select().from(scenes).where(eq(scenes.storyboardId, sb.id)).orderBy(scenes.order);
    const target = current.find((s) => s.id === sceneId);
    if (!target) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "scene not found");

    const pack = await promptAgent(
      deps.provider,
      target.content,
      (row.characters ?? []) as Character[],
      (row.locations ?? []) as Location[],
    );

    const version = sb.version + 1;
    const newSbId = randomUUID();
    sqlite.transaction(() => {
      db.insert(storyboards).values({ id: newSbId, projectId: id, version }).run();
      db.insert(scenes).values(
        current.map((s) => ({
          id: randomUUID(),
          storyboardId: newSbId,
          order: s.order,
          version,
          content: s.content,
          // Only the target scene gets the regenerated pack; everything else
          // (content, order, other packs) carries into the new version rows.
          promptPack: s.id === sceneId ? pack : s.promptPack,
        })),
      ).run();
    })();

    const storyboard = await loadStoryboard(id);
    return { storyboard };
  });
}
