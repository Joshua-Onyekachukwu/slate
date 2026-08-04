import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildWorkflow, resumeWorkflow, type WorkflowDeps, type WorkflowGraph } from "@slate/ai";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { db, projects, scripts } from "@slate/db";
import type { Provider } from "@slate/ai";

// The slice's single review gate. The route param is the PRODUCING stage
// ("script"); gate.value is the interrupt payload ("script_review") — see
// api-design.md "Stage approve / regenerate — exact contract".
export const GATE_VALUE_BY_STAGE: Record<string, string> = {
  script: "script_review",
};

const workflowDeps: WorkflowDeps = {
  getProject: async (id) => {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new Error("project not found");
    return {
      id: row.id,
      idea: row.idea,
      conversation: (row.conversation as never[] | null) ?? [],
      stage: row.stage,
      status: row.status,
      brief: row.brief,
    };
  },
  saveProject: async (id, patch) => {
    await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, id));
  },
  saveScript: async (projectId, content) => {
    const [latest] = await db.select({ version: scripts.version }).from(scripts)
      .where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.version)).limit(1);
    await db.insert(scripts).values({
      id: randomUUID(),
      projectId,
      version: (latest?.version ?? 0) + 1,
      content,
      createdBy: "ai",
    });
  },
};

export function buildApiWorkflow(provider: Provider, checkpointer: BaseCheckpointSaver) {
  return buildWorkflow(provider, workflowDeps, checkpointer);
}

export interface CheckpointView {
  stage: string | undefined;
  pendingGates: string[]; // interrupt payload values the thread is paused at
}

// project.stage MUST come from the checkpoint, not the projects column (the
// column is only lazily patched to "brief" by discovery). The pending gates
// come from getState().tasks[].interrupts (langgraph 0.2.x, per the spike).
export async function readCheckpoint(graph: WorkflowGraph, threadId: string): Promise<CheckpointView> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  const pendingGates = (snapshot.tasks ?? [])
    .flatMap((t: { interrupts?: { value?: unknown }[] }) => t.interrupts ?? [])
    .map((i) => i.value)
    .filter((v): v is string => typeof v === "string");
  return { stage: snapshot.values.stage as string | undefined, pendingGates };
}

export type { WorkflowGraph };
export { resumeWorkflow };
