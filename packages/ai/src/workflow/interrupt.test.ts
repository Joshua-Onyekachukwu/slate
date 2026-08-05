import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { FakeProvider } from "../providers/fake";
import { resumeWorkflow } from "./resume";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = "./data/test-interrupt.db";

// Self-contained helper: an engineer reads this task alone.
const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe",
    conversation: [], stage: "discovery", status: "active", brief: null,
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
});

describe("interrupt persistence", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => {
    checkpointer.db.close();
  });

  it("survives a graph rebuild between interrupts", async () => {
    const scripted = [
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ];
    // graph instance 1: run to first interrupt (script gate)
    const g1 = buildWorkflow(new FakeProvider(scripted), fakeDeps(), checkpointer);
    await g1.invoke({ projectId: "p1" }, { configurable: { thread_id: "p1" } });
    // Prove the pause actually happened at the gate before rebuilding — makes the
    // "survives rebuild" claim explicit instead of relying on resume-without-interrupt
    // erroring (langgraph-internal behavior that could change).
    const paused = await g1.getState({ configurable: { thread_id: "p1" } });
    const pending = (paused.tasks ?? []).flatMap((t) => (t as { interrupts?: { value?: unknown }[] }).interrupts ?? []);
    expect(pending.map((i) => i.value)).toContain("script_review");
    // graph instance 2: resume with the SAME checkpointer (new process = new graph object)
    const g2 = buildWorkflow(new FakeProvider([]), fakeDeps(), checkpointer);
    await resumeWorkflow(g2, "p1", { approved: true }); // script approved → done
    const state = await g2.getState({ configurable: { thread_id: "p1" } });
    expect(state.values.stage).toBe("done");
  });
});
