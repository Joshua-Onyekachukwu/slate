import Fastify, { type FastifyError } from "fastify";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { Provider } from "@slate/ai";
import { projectRoutes } from "./routes/projects";
import { stageRoutes } from "./routes/stages";
import { scriptRoutes } from "./routes/scripts";
import { streamRoute } from "./routes/stream";
import { ApiError } from "./error";

export interface AppDeps {
  provider: Provider;
  checkpointer: BaseCheckpointSaver;
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: false });

  app.register(projectRoutes, deps);
  app.register(stageRoutes, deps);
  app.register(scriptRoutes, deps);
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
