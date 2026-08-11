import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { Provider } from "@slate/ai";
import { projectRoutes } from "./routes/projects";
import { stageRoutes } from "./routes/stages";
import { scriptRoutes } from "./routes/scripts";
import { storyboardRoutes } from "./routes/storyboard";
import { sceneRoutes } from "./routes/scenes";
import { promptRoutes } from "./routes/prompts";
import { productionPlanRoutes } from "./routes/production-plan";
import { streamRoute } from "./routes/stream";
import { ApiError } from "./error";
import { requireUser } from "./hooks";
import type { TokenVerifier } from "./auth";

export interface AppDeps {
  provider: Provider;
  checkpointer: BaseCheckpointSaver;
  // Enforced auth (Clerk, ADR-022/023): when provided, every /api/v1 request
  // must present a valid Bearer JWT and routes scope by owner_id. Omit it for
  // local/slice mode (single-user, no sessions) — the demo and E2E run that way.
  verifyToken?: TokenVerifier;
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: false });

  // userId is set by requireUser in enforced mode; stays "" in local mode.
  app.decorateRequest("userId", "");

  // Local-first slice (no auth): allow the Next.js dev origin. Tightened when
  // auth lands (Phase 1+2) — CORS will be scoped to the app origin. Registered
  // BEFORE the auth hook: Fastify runs onRequest hooks in registration order,
  // so preflight (OPTIONS, no Authorization header) must hit CORS first or it
  // would be 401'd by auth and cross-origin calls would break in enforced mode.
  // methods EXPLICIT: @fastify/cors@11 defaults to 'GET,HEAD,POST', which would
  // CORS-block every PUT (reorder, scene edits) — the browser preflight fails
  // with "Method PUT is not allowed by Access-Control-Allow-Methods".
  // origin: local-first default reflects ANY origin; CORS_ORIGIN (comma-separated)
  // locks it to the deployed web origin(s) for production (docs/deploy.md).
  const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : true;
  app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });

  if (deps.verifyToken) {
    const authHook = requireUser(deps.verifyToken);
    app.addHook("onRequest", async (req, reply) => {
      if (req.method === "OPTIONS") return; // CORS preflight carries no bearer token
      if (req.url.split("?")[0] === "/api/v1/health") return; // liveness probes stay public
      return authHook(req, reply);
    });
  }

  app.register(projectRoutes, deps);
  app.register(stageRoutes, deps);
  app.register(scriptRoutes, deps);
  app.register(storyboardRoutes, deps);
  app.register(sceneRoutes, deps);
  app.register(promptRoutes, deps);
  app.register(productionPlanRoutes, deps);
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
