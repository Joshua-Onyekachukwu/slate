import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { FakeProvider } from "../providers/fake";
import { resumeWorkflow } from "./resume";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = "./data/test-interrupt.db";

const RESEARCH = '{"timeline":["13.8 bya: Big Bang"],"concepts":["cosmic inflation"],"terminology":{},"references":["NASA"],"keyEvents":["First stars ignite"]}';

// Self-contained helper: an engineer reads this task alone.
const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe",
    conversation: [], stage: "discovery", status: "active", brief: null,
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
  saveStoryboard: async (_projectId, scenes) => { expect(scenes.length).toBeGreaterThan(0); },
  savePromptPacks: async (_projectId, packs) => { expect(packs.length).toBeGreaterThan(0); },
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
      { content: RESEARCH }, // researchAgent
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ];
    // graph instance 1: run to first interrupt (research gate)
    const g1 = buildWorkflow(new FakeProvider(scripted), fakeDeps(), checkpointer);
    await g1.invoke({ projectId: "p1" }, { configurable: { thread_id: "p1" } });
    // Prove the pause actually happened at the gate before rebuilding — makes the
    // "survives rebuild" claim explicit instead of relying on resume-without-interrupt
    // erroring (langgraph-internal behavior that could change).
    const paused = await g1.getState({ configurable: { thread_id: "p1" } });
    const pending = (paused.tasks ?? []).flatMap((t) => (t as { interrupts?: { value?: unknown }[] }).interrupts ?? []);
    expect(pending.map((i) => i.value)).toContain("research_review");
    // graph instance 2: resume with the SAME checkpointer (new process = new graph object).
    // The queue is minimal — brief/script/scores were consumed by g1's queue and
    // their state (script content) must survive in the checkpoint for the
    // storyboard pass to produce scenes; an empty queue here would throw loudly.
    // g2 resumes the RESEARCH gate first — approving it re-runs write_script +
    // review, so g2's queue must supply script + scores again (checkpoint state
    // preserves them, but the agents re-run on this path).
    const g2 = buildWorkflow(new FakeProvider([
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' }, // scriptAgent
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' }, // reviewerAgent
      { content: '[{"id":"char-1","name":"The Narrator","description":"A calm voice"}]' }, // characterAgent
      { content: '[{"id":"loc-1","name":"The Universe","description":"Vast"}]' },           // environmentAgent
      { content: JSON.stringify([{ title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }]) }, // storyboardAgent
      { content: JSON.stringify([{ title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }]) }, // editorAgent
      { content: JSON.stringify({ imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" }) }, // promptAgent
    ]), fakeDeps(), checkpointer);
    await resumeWorkflow(g2, "p1", { approved: true }); // research approved → script + review → script gate
    await resumeWorkflow(g2, "p1", { approved: true }); // script approved → storyboard gate
    const atStoryboard = await g2.getState({ configurable: { thread_id: "p1" } });
    const sbInterrupts = (atStoryboard.tasks ?? []).flatMap((t: { interrupts?: { value?: unknown }[] }) =>
      (t.interrupts ?? []).map((i) => i.value),
    );
    expect(sbInterrupts).toContain("storyboard_review");
    await resumeWorkflow(g2, "p1", { approved: true }); // storyboard approved → done
    const state = await g2.getState({ configurable: { thread_id: "p1" } });
    expect(state.values.stage).toBe("done");
  });
});
