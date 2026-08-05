import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { Provider } from "@slate/ai";
import { projectRoutes } from "./routes/projects";
import { stageRoutes } from "./routes/stages";
import { scriptRoutes } from "./routes/scripts";
import { storyboardRoutes } from "./routes/storyboard";
import { streamRoute } from "./routes/stream";
import { ApiError } from "./error";

export interface AppDeps {
  provider: Provider;
  checkpointer: BaseCheckpointSaver;
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: false });

  // Local-first slice (no auth): allow the Next.js dev origin. Tightened when
  // auth lands (Phase 1+2) — CORS will be scoped to the app origin.
  app.register(cors, { origin: true });

  app.register(projectRoutes, deps);
  app.register(stageRoutes, deps);
  app.register(scriptRoutes, deps);
  app.register(storyboardRoutes, deps);
  app.register(streamRoute, deps);

  app.get("/api/v1/health", async () => ({ status: "ok", service: "slate-api" }));

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const statusCode = err.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL",
        message: err.message ?? "internal error",
        details: {},
      },
    });
  });

  return app;
}
