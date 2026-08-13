import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { sendError, ERROR_CODES } from "../error";

// Demo media (FAKE_PROVIDER demo): the "generated film assets" the FakeProvider
// hands out as real URLs, served here so the FFmpeg renderer can download them
// and assemble an actual watchable film (runner stills looped per scene, the
// hero clip as a motion segment). Kept OUTSIDE /api/v1 so no auth hook applies
// - this is public demo media only, with a strictly validated filename so a
// traversal attempt can never escape the demo-media directory.
//
// The files are synced from the landing's /frames imagery by
// scripts/sync-demo-media.sh (boot-slice.sh runs it) into data/demo-media:
// cold-open.jpg, the-flash.jpg, first-light.jpg, cold-open.mp4.
const FILE_RE = /^[\w.-]+$/;

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
};

export async function demoMediaRoutes(app: FastifyInstance) {
  app.get("/demo-media/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    // Single safe segment: no slashes, and never "." / "..".
    if (!FILE_RE.test(file) || file === "." || file === "..") {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "invalid media filename");
    }
    const dir = process.env.DEMO_MEDIA_DIR ?? join(process.cwd(), "data", "demo-media");
    const target = join(dir, file);
    if (!existsSync(target)) {
      return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "demo media not found");
    }
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    reply.type(MIME[ext] ?? "application/octet-stream");
    return reply.send(createReadStream(target));
  });
}
