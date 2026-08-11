import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, storyboards, scenes, assets } from "@slate/db";
import { AssetKind, type AssetKind as AssetKindType } from "@slate/shared";
import { ProviderError, type Provider, type MediaArtifact } from "@slate/ai";
import { getOwnedProject, UUID_RE } from "../hooks";
import { sendError, ERROR_CODES } from "../error";
import type { AppDeps } from "../app";

// Phase 3 Block 1 — per-scene media generation. A scene's prompt pack drives
// every kind: image → imagePrompt, video → videoPrompt (+ duration), voice →
// the narration TEXT with the narrationPrompt as style, music → musicPrompt
// (+ duration). Generation is synchronous in the MVP (fake provider returns
// instantly); the provider abstraction keeps an async/queued path a later
// block away.
//
// Contract: 400 invalid kind · 404 project/scene · 409 no prompt pack yet ·
// 502 provider failure (failed row persisted, retryable) · 201 ready asset.
const KINDS = Object.values(AssetKind) as AssetKindType[];

// Same 409/404 split as the prompts routes: no storyboard yet → 409 (the
// storyboard gate hasn't run), storyboard exists but scene id is unknown → 404.
async function locateScene(projectId: string, sceneId: string) {
  // Check order matters (matches the prompts routes): 409 no-storyboard FIRST
  // (before validating the scene id), then a garbage (non-uuid) scene id must
  // 404 like any other missing scene — a raw eq() would hit Postgres' uuid
  // type-cast and 500 (same trap hooks.ts guards).
  const [sb] = await db.select().from(storyboards)
    .where(eq(storyboards.projectId, projectId)).orderBy(desc(storyboards.version)).limit(1);
  if (!sb) return { noStoryboard: true, scene: null as typeof scenes.$inferSelect | null };
  if (!UUID_RE.test(sceneId)) return { noStoryboard: false, scene: null as typeof scenes.$inferSelect | null };
  const [scene] = await db.select().from(scenes)
    .where(and(eq(scenes.storyboardId, sb.id), eq(scenes.id, sceneId))).limit(1);
  return { noStoryboard: false, scene: scene ?? null };
}

async function generate(provider: Provider, kind: AssetKindType, scene: typeof scenes.$inferSelect): Promise<MediaArtifact> {
  const pack = scene.promptPack!;
  switch (kind) {
    case "image": return provider.generateImage({ prompt: pack.imagePrompt });
    case "video": return provider.generateVideo({ prompt: pack.videoPrompt, durationSeconds: scene.content.durationSeconds });
    case "voice": return provider.generateVoiceover({ text: scene.content.narration, style: pack.narrationPrompt });
    case "music": return provider.generateMusic({ prompt: pack.musicPrompt, durationSeconds: scene.content.durationSeconds });
  }
}

export async function assetRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/projects/:id/scenes/:sceneId/assets", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const { noStoryboard, scene } = await locateScene(id, sceneId);
    if (noStoryboard) return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard yet for this project");
    if (!scene) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "scene not found");
    const rows = await db.select().from(assets).where(eq(assets.sceneId, sceneId)).orderBy(assets.createdAt);
    return { assets: rows };
  });

  app.post("/api/v1/projects/:id/scenes/:sceneId/assets", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const { noStoryboard, scene } = await locateScene(id, sceneId);
    if (noStoryboard) return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard yet for this project");
    if (!scene) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "scene not found");

    const body = (req.body ?? {}) as { kind?: unknown };
    if (typeof body.kind !== "string" || !(KINDS as string[]).includes(body.kind)) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "kind must be one of: image, video, voice, music");
    }
    const kind = body.kind as AssetKindType;
    if (!scene.promptPack) {
      return sendError(reply, ERROR_CODES.CONFLICT, 409, "no prompt pack yet — generate the scene's prompts first");
    }

    const assetId = randomUUID();
    const base = { id: assetId, sceneId, kind, provider: deps.provider.name };
    try {
      const artifact = await generate(deps.provider, kind, scene);
      await db.insert(assets).values({
        ...base, status: "ready", url: artifact.url, mimeType: artifact.mimeType,
        // Block 2 — the per-asset quality gate: the provider's eval rides in
        // meta.quality; the UI flags score < 3 for regeneration.
        meta: {
          width: artifact.width ?? null,
          height: artifact.height ?? null,
          quality: artifact.quality ?? null,
        },
      });
      const [saved] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
      return reply.code(201).send({ asset: saved });
    } catch (e) {
      // Persist the FAILED row so the failure is visible in the scene and the
      // UI can offer a retry — never a silent 500 with no trace.
      const message = e instanceof ProviderError ? e.message : "generation failed";
      await db.insert(assets).values({ ...base, status: "failed", error: message });
      const [saved] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
      return sendError(reply, ERROR_CODES.PROVIDER_FAILURE, 502, message, { asset: saved });
    }
  });
}
