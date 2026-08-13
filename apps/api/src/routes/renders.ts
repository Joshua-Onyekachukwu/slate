import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db, renders, assets } from "@slate/db";
import type { AssetKind } from "@slate/shared";
import { buildApiWorkflow, readCheckpoint } from "../workflow";
import { loadStoryboard } from "./storyboard";
import { getOwnedProject, UUID_RE } from "../hooks";
import { sendError, ERROR_CODES } from "../error";
import { RenderError, createRenderer, type Renderer, type RenderScene } from "../render/renderer";
import type { AppDeps } from "../app";

// Phase 3 Block 4 - FFmpeg render/export. POST renders a LOCKED production
// plan (stage done) into <rendersDir>/<projectId>/<renderId>/ and persists one
// renders row per take (pending → rendering → ready | failed). Files are served
// back through the owner-scoped static route below.
//
// Contract: 404 unknown project · 409 plan not locked / no storyboard ·
// 501 RENDER_UNAVAILABLE (no ffmpeg binary; failed row persisted) ·
// 502 RENDER_FAILED (ffmpeg exited non-zero) · 201 ready render.

const CONTENT_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  png: "image/png",
  json: "application/json",
  srt: "application/x-subrip",
  zip: "application/zip",
};
// Single safe path segment: no slashes (blocks traversal), no spaces, letters/
// digits/dot/underscore/hyphen. A URL-decoded "..%2F.." fails this check → 400.
const FILE_RE = /^[\w.-]+$/;

const defaultRenderer = () => createRenderer();

export async function renderRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/projects/:id/render", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");

    // A locked production plan is required (checkpoint-derived stage - the same
    // contract as the production-plan endpoint, NOT the stale projects column).
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    if (cp.stage !== "done") {
      return sendError(reply, ERROR_CODES.CONFLICT, 409, "production plan not locked - approve the storyboard first");
    }
    const sb = await loadStoryboard(id);
    if (!sb || sb.scenes.length === 0) {
      return sendError(reply, ERROR_CODES.CONFLICT, 409, "no storyboard to render");
    }

    const renderer: Renderer = deps.renderer ?? defaultRenderer();
    const renderId = randomUUID();
    const outDir = join(renderer.rendersDir, id, renderId);

    const sceneIds = sb.scenes.map((s) => s.id);
    const assetRows = await db.select().from(assets)
      .where(and(inArray(assets.sceneId, sceneIds), eq(assets.status, "ready")));

    // Auto-narration: every scene with narration text gets a voice track even
    // without manual per-scene asset generation. Scenes that already hold a
    // ready voice asset reuse it; the rest are synthesized now through
    // deps.voice (ElevenLabs / edge-tts / Windows SAPI). A synthesis failure
    // degrades gracefully - captions still carry the line, the film renders.
    const scenes: RenderScene[] = [];
    for (const s of sb.scenes) {
      const assets = assetRows.filter((a) => a.sceneId === s.id)
        .map((a) => ({ kind: a.kind as AssetKind, url: a.url ?? "", mimeType: a.mimeType }));
      const narration = s.content.narration ?? "";
      if (deps.voice && narration && !assets.some((a) => a.kind === "voice")) {
        try {
          const v = await deps.voice.generateVoiceover({ text: narration, style: s.promptPack?.narrationPrompt });
          assets.push({ kind: "voice", url: v.url, mimeType: v.mimeType });
        } catch (e) {
          console.warn(`[voice] auto-narration failed for scene ${s.order}: ${(e as Error).message}`);
        }
      }
      scenes.push({
        order: s.order,
        // loadStoryboard returns { id, order, content, promptPack } - the title
        // lives in the SceneContent jsonb, not a top-level column.
        title: s.content.title ?? `Scene ${s.order}`,
        narration,
        durationSeconds: s.content.durationSeconds ?? 10,
        transition: s.content.transition ?? "CUT",
        assets,
      });
    }

    await db.insert(renders).values({ id: renderId, projectId: id, status: "rendering" });

    try {
      const result = await renderer.render({ projectId: id, title: row.title ?? row.idea, scenes, outDir });
      const url = (f: string) => `/api/v1/renders/${id}/${renderId}/${f}`;
      await db.update(renders).set({
        status: "ready",
        mp4Url: url(result.mp4),
        thumbnailUrl: url(result.thumbnail),
        manifestUrl: url(result.manifest),
        packageUrl: url(result.pkg),
        meta: { segments: result.segments, ffmpeg: result.ffmpeg, scenes: scenes.length },
      }).where(eq(renders.id, renderId));
    } catch (e) {
      const renderError = e instanceof RenderError ? e : new RenderError("RENDER_FAILED", (e as Error).message);
      await db.update(renders).set({ status: "failed", error: renderError.message }).where(eq(renders.id, renderId));
      const [failed] = await db.select().from(renders).where(eq(renders.id, renderId)).limit(1);
      if (renderError.code === "FFMPEG_MISSING") {
        return sendError(reply, ERROR_CODES.RENDER_UNAVAILABLE, 501, renderError.message, { render: failed });
      }
      return sendError(reply, ERROR_CODES.RENDER_FAILED, 502, renderError.message, { render: failed });
    }

    const [saved] = await db.select().from(renders).where(eq(renders.id, renderId)).limit(1);
    return reply.code(201).send({ render: saved });
  });

  app.get("/api/v1/projects/:id/renders", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const rows = await db.select().from(renders)
      .where(eq(renders.projectId, id)).orderBy(desc(renders.createdAt));
    return { renders: rows };
  });

  // Serves the rendered files (MP4/thumbnail/manifest/package). Owner-scoped
  // like every /api/v1 route; the file segment is validated before touching
  // the filesystem so a traversal attempt can never escape the render dir.
  app.get("/api/v1/renders/:projectId/:renderId/:file", async (req, reply) => {
    const { projectId, renderId, file } = req.params as { projectId: string; renderId: string; file: string };
    const row = await getOwnedProject(req.userId, projectId);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    // Single safe segment: no slashes, and never "." / ".." (a lone dot-dot
    // would resolve one level up inside the project's render area).
    if (!FILE_RE.test(file) || file === "." || file === ".." || !UUID_RE.test(renderId)) {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "invalid render file path");
    }
    const renderer: Renderer = deps.renderer ?? defaultRenderer();
    const target = join(renderer.rendersDir, projectId, renderId, file);
    if (!existsSync(target)) {
      return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "render file not found");
    }
    reply.type(CONTENT_TYPE[file.split(".").pop() ?? ""] ?? "application/octet-stream");
    return reply.send(createReadStream(target));
  });
}
