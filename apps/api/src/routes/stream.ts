import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, projects } from "@slate/db";
import { buildApiWorkflow, readCheckpoint } from "../workflow";
import { sendError, ERROR_CODES } from "../error";
import type { AppDeps } from "../app";

// Simple SSE: poll the workflow checkpoint every 500ms, emit on change.
// Keep it correct: heartbeat comment every 15s prevents idle disconnect.
export async function streamRoute(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/projects/:id/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write("retry: 2000\n\n");

    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    let last = "";
    const send = (event: string, data: unknown) => {
      const line = `${event}:${JSON.stringify(data)}\n\n`;
      if (line !== last) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        last = line;
      }
    };

    const tick = async () => {
      // Never let a checkpoint error escape into setInterval (unhandled rejection
      // would kill the stream silently) — surface stage:failed and end instead.
      try {
        const cp = await readCheckpoint(graph, id);
        if (cp.pendingGates.length > 0) send("stage:awaiting_review", { gates: cp.pendingGates });
        else if (cp.stage === "done") send("stage:done", { stage: cp.stage });
        else send("stage:started", { stage: cp.stage });
      } catch (err) {
        send("stage:failed", { error: (err as Error).message ?? "unknown error" });
        clearInterval(poll);
        clearInterval(heartbeat);
        reply.raw.end();
      }
    };

    const poll = setInterval(tick, 500);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    await tick();

    reply.raw.on("close", () => {
      clearInterval(poll);
      clearInterval(heartbeat);
    });
    return reply;
  });
}
