import type { FastifyInstance, FastifyReply } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, projects, scripts, storyboards, scenes } from "@slate/db";
import { buildApiWorkflow, readCheckpoint, resumeWorkflow, GATE_VALUE_BY_STAGE } from "../workflow";
import { sendError, ApiError, ERROR_CODES } from "../error";
import { getOwnedProject } from "../hooks";
import type { AppDeps } from "../app";

// Stage payload shape per api-design.md "Stage approve / regenerate - exact contract".
interface StageView {
  key: string;
  status: "idle" | "running" | "awaiting_review" | "approved" | "failed";
  version: number | null;
  updatedAt: string | null;
  gate: { value: string } | null;
}

export async function stageRoutes(app: FastifyInstance, deps: AppDeps) {
  // Read the checkpoint + latest script row for a project's stage view.
  // Status: a gate stage is awaiting_review while paused at it; done → approved;
  // otherwise derive from content presence (brief produced / script versioned)
  // so a completed non-gate stage reads approved, not "idle".
  const loadStageView = async (id: string, key: string): Promise<{ project: { id: string; stage: string | undefined }; stage: StageView }> => {
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    const [latest] = await db.select().from(scripts).where(eq(scripts.projectId, id)).orderBy(desc(scripts.version)).limit(1);
    const [sbLatest] = await db.select().from(storyboards).where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
    const gateValue = GATE_VALUE_BY_STAGE[key];
    const pausedHere = gateValue !== undefined && cp.pendingGates.includes(gateValue);
    const isStoryboard = key === "storyboard";
    const hasContent = row
      ? key === "brief" ? row.brief !== null
      : key === "research" ? row.researchPacket !== null
      : isStoryboard ? sbLatest !== undefined
      : latest !== undefined
      : false;
    const status: StageView["status"] =
      pausedHere ? "awaiting_review"
      : cp.stage === "done" ? "approved"
      : hasContent ? "approved"
      : "idle";
    return {
      project: { id, stage: cp.stage },
      stage: {
        key,
        status,
        version: isStoryboard ? sbLatest?.version ?? null : latest?.version ?? null,
        updatedAt: isStoryboard ? sbLatest?.createdAt.toISOString() ?? null : latest?.createdAt.toISOString() ?? null,
        gate: pausedHere ? { value: gateValue } : null,
      },
    };
  };

  // Approve/regenerate share one gate-checked resume path (no double-fire):
  // the workflow gate is the only place a new version is produced. Returns
  // null if it already replied with an error (4xx); else returns the view.
  const gateResume = async (
    userId: string,
    id: string,
    stage: string,
    reply: FastifyReply,
    resume: { approved: boolean; feedback?: string },
  ): Promise<{ project: { id: string; stage: string | undefined }; stage: StageView } | null> => {
    const gateValue = GATE_VALUE_BY_STAGE[stage];
    if (!gateValue) {
      sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, `unknown stage: ${stage}`);
      return null;
    }
    // Owner gate BEFORE resume: cross-user approve/regenerate must 404, never
    // resume someone else's LangGraph thread.
    const row = await getOwnedProject(userId, id);
    if (!row) throw new ApiError(ERROR_CODES.NOT_FOUND, 404, "project not found");
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    // 409 unless THIS gate is the one paused - resuming while paused elsewhere
    // would silently apply this gate's decision to the wrong stage.
    if (!cp.pendingGates.includes(gateValue)) {
      sendError(reply, ERROR_CODES.CONFLICT, 409, `no pending ${gateValue} interrupt`);
      return null;
    }
    await resumeWorkflow(graph, id, resume);
    return loadStageView(id, stage);
  };

  app.get("/api/v1/projects/:id/stages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const view = await loadStageView(id, "script");
    return { stages: [view.stage] };
  });

  app.get("/api/v1/projects/:id/stages/:stage", async (req, reply) => {
    const { id, stage } = req.params as { id: string; stage: string };
    const row = await getOwnedProject(req.userId, id);
    if (!row) return sendError(reply, ERROR_CODES.NOT_FOUND, 404, "project not found");
    const view = await loadStageView(id, stage);
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    const cp = await readCheckpoint(graph, id);
    const [latest] = await db.select().from(scripts).where(eq(scripts.projectId, id)).orderBy(desc(scripts.version)).limit(1);
    const [sbLatest] = await db.select().from(storyboards).where(eq(storyboards.projectId, id)).orderBy(desc(storyboards.version)).limit(1);
    let storyboard = null;
    if (sbLatest) {
      const sbScenes = await db.select().from(scenes).where(eq(scenes.storyboardId, sbLatest.id)).orderBy(scenes.order);
      storyboard = { version: sbLatest.version, scenes: sbScenes.map((s) => ({ id: s.id, order: s.order, content: s.content, promptPack: s.promptPack ?? null })) };
    }
    return {
      ...view,
      content: stage === "script"
        ? { script: latest?.content ?? null, scores: cp.scores ?? null }
        : stage === "brief" ? { brief: row.brief }
        : stage === "research" ? { research: row.researchPacket }
        : stage === "storyboard" ? { storyboard }
        : { conversation: row.conversation },
    };
  });

  app.post("/api/v1/projects/:id/stages/:stage/approve", async (req, reply) => {
    const { id, stage } = req.params as { id: string; stage: string };
    const body = (req.body ?? {}) as { approved?: boolean; feedback?: string };
    if (typeof body.approved !== "boolean") {
      return sendError(reply, ERROR_CODES.VALIDATION_ERROR, 400, "approved must be a boolean");
    }
    const view = await gateResume(req.userId, id, stage, reply, { approved: body.approved, feedback: body.feedback });
    if (!view) return;
    return { project: view.project, stage: view.stage };
  });

  app.post("/api/v1/projects/:id/stages/:stage/regenerate", async (req, reply) => {
    const { id, stage } = req.params as { id: string; stage: string };
    const body = (req.body ?? {}) as { feedback?: string };
    const view = await gateResume(req.userId, id, stage, reply, { approved: false, feedback: body.feedback ?? "regenerate" });
    if (!view) return;
    return { project: view.project, stage: view.stage };
  });
}
