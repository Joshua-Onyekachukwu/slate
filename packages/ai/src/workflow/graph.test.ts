import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { resumeWorkflow } from "./resume";
import { FakeProvider } from "../providers/fake";
import type { ChatMessage } from "../providers/types";
import type { Brief } from "@slate/shared";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

// Distinct files per describe: on Windows a closed SqliteSaver can still hold the
// file open briefly, so a shared path fails the second beforeAll's rmSync (EPERM).
const TEST_PATH_HAPPY = "./data/test-workflow-happy.db";
const TEST_PATH_REJECT = "./data/test-workflow-reject.db";
const TEST_PATH_INTERVIEW = "./data/test-workflow-interview.db";

const SCENE = {
  title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c",
  durationSeconds: 8, transition: "CUT", musicCue: "m",
};
const PROMPT_PACK = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };

const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id,
    idea: "doc about the universe",
    conversation: [],
    stage: "discovery",
    status: "active",
    brief: null,
  }),
  saveProject: async (_id, patch) => {
    expect(patch).toBeDefined();
  },
  saveScript: async (_projectId, content) => {
    expect(content).toBeDefined();
  },
  saveStoryboard: async (_projectId, scenes) => {
    expect(scenes.length).toBeGreaterThan(0);
  },
  savePromptPacks: async (_projectId, packs) => {
    expect(packs.length).toBeGreaterThan(0);
  },
});

// Stateful fake for the interview path: getProject must return the accumulated
// conversation (a hardcoded [] would make planning re-ask forever → infinite loop).
// `conversation` has no `at` field (that's only in the save patch); the graph
// channel carries plain ChatMessage[] and Brief.
const statefulDeps = (): WorkflowDeps => {
  const state: { conversation: ChatMessage[]; brief: Brief | null } = { conversation: [], brief: null };
  return {
    getProject: async (id: string) => ({
      id,
      idea: "doc about the universe",
      conversation: state.conversation,
      stage: "discovery",
      status: "active",
      brief: state.brief,
    }),
    saveProject: async (_id, patch) => {
      if (Array.isArray(patch.conversation)) state.conversation = patch.conversation as ChatMessage[];
      if (patch.brief && typeof patch.brief === "object") state.brief = patch.brief as Brief;
    },
    saveScript: async () => {},
    saveStoryboard: async () => {},
    savePromptPacks: async () => {},
  };
};

// Uses the real SQLite checkpointer so interrupt state truly persists across calls.
describe("workflow happy path", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH_HAPPY, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH_HAPPY);
  });
  afterAll(() => {
    checkpointer.db.close();
  });

  it("runs discovery→brief→script→review→storyboard→prompts, pausing at each gate", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
      { content: JSON.stringify([SCENE]) },     // storyboardAgent
      { content: JSON.stringify([SCENE]) },     // editorAgent (same scenes, transition/music filled)
      { content: JSON.stringify(PROMPT_PACK) }, // promptAgent
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    await graph.invoke({ projectId: "p1" }, { configurable: { thread_id: "p1" } });
    // Graph pauses at the script gate.
    const paused = await graph.getState({ configurable: { thread_id: "p1" } });
    const pendingInterrupts = (paused.tasks ?? []).flatMap((t: { interrupts?: unknown[] }) => t.interrupts ?? []);
    expect(pendingInterrupts.length).toBeGreaterThan(0);
    // Approve script → storyboard + prompts → storyboard gate.
    await resumeWorkflow(graph, "p1", { approved: true });
    const atStoryboard = await graph.getState({ configurable: { thread_id: "p1" } });
    expect(atStoryboard.values.stage).toBe("storyboard");
    const sbInterrupts = (atStoryboard.tasks ?? []).flatMap((t: { interrupts?: { value?: unknown }[] }) =>
      (t.interrupts ?? []).map((i) => i.value),
    );
    expect(sbInterrupts).toContain("storyboard_review");
    // Approve storyboard → done.
    await resumeWorkflow(graph, "p1", { approved: true });
    const state = await graph.getState({ configurable: { thread_id: "p1" } });
    expect(state.values.stage).toBe("done");
  });
});

describe("workflow reject loop", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH_REJECT, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH_REJECT);
  });
  afterAll(() => {
    checkpointer.db.close();
  });

  it("rejects the script, regenerates with feedback, then approves to done", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["weak hook"],"overall":2}' },
      { content: '{"title":"T2","hook":"H2","introduction":"I2","body":["B2"],"conclusion":"C2","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
      { content: JSON.stringify([SCENE]) },     // storyboardAgent
      { content: JSON.stringify([SCENE]) },     // editorAgent
      { content: JSON.stringify(PROMPT_PACK) }, // promptAgent
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const threadId = "p-reject";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } }); // → script gate (low scores)
    await resumeWorkflow(graph, threadId, { approved: false, feedback: "fix the hook" }); // reject → regenerate script → review → script gate
    await resumeWorkflow(graph, threadId, { approved: true }); // approve script → storyboard gate
    await resumeWorkflow(graph, threadId, { approved: true }); // approve storyboard → done
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
  });
});

describe("workflow storyboard flow", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync("./data/test-workflow-storyboard.db", { force: true }); // hermetic
    checkpointer = SqliteSaver.fromConnString("./data/test-workflow-storyboard.db");
  });
  afterAll(() => {
    checkpointer.db.close();
  });

  it("runs script approve → storyboard → editor → prompts, pausing at the storyboard gate → approve → done", async () => {
    // Queue: brief, script, scores, storyboard (1 scene), prompt for that scene.
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
      { content: JSON.stringify([SCENE]) },     // storyboardAgent
      { content: JSON.stringify([SCENE]) },     // editorAgent
      { content: JSON.stringify(PROMPT_PACK) }, // promptAgent
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const threadId = "p-story";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } }); // → script gate
    await resumeWorkflow(graph, threadId, { approved: true }); // approve script → storyboard → prompts
    const paused = await graph.getState({ configurable: { thread_id: threadId } });
    const interruptValues = (paused.tasks ?? []).flatMap((t: { interrupts?: { value?: unknown }[] }) =>
      (t.interrupts ?? []).map((i) => i.value),
    );
    expect(interruptValues).toContain("storyboard_review"); // 2nd gate
    expect(paused.values.stage).toBe("storyboard");
    expect((paused.values.storyboard as unknown[]).length).toBeGreaterThan(0);
    expect((paused.values.promptPacks as unknown[]).length).toBeGreaterThan(0);

    await resumeWorkflow(graph, threadId, { approved: true }); // approve storyboard → done
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
  });

  it("rejects the storyboard → regenerates with feedback → re-pauses → approve → done", async () => {
    // Queue: brief, script, scores, storyboard v1 + prompt, storyboard v2 + prompt.
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
      { content: JSON.stringify([{ ...SCENE, title: "The Bang" }]) },  // storyboardAgent v1
      { content: JSON.stringify([{ ...SCENE, title: "The Bang" }]) },  // editorAgent v1
      { content: JSON.stringify(PROMPT_PACK) },                         // promptAgent v1
      { content: JSON.stringify([{ ...SCENE, title: "The Bang (v2)", transition: "DISSOLVE" }]) }, // storyboardAgent v2
      { content: JSON.stringify([{ ...SCENE, title: "The Bang (v2)", transition: "DISSOLVE" }]) }, // editorAgent v2
      { content: JSON.stringify(PROMPT_PACK) },                         // promptAgent v2
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const threadId = "p-story-reject";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } });
    await resumeWorkflow(graph, threadId, { approved: true }); // approve script
    await resumeWorkflow(graph, threadId, { approved: false, feedback: "make scene 1 shorter" }); // reject storyboard
    const rePaused = await graph.getState({ configurable: { thread_id: threadId } });
    expect((rePaused.values.storyboard as { title: string }[])[0].title).toBe("The Bang (v2)");
    await resumeWorkflow(graph, threadId, { approved: true }); // approve storyboard v2
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
  });
});

describe("workflow discovery interview", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH_INTERVIEW, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH_INTERVIEW);
  });
  afterAll(() => {
    checkpointer.db.close();
  });

  it("pauses for answers, resumes with them, then continues to the script gate", async () => {
    // planning asks questions first, then (after answers) produces the brief.
    const p = new FakeProvider([
      { content: '{"kind":"questions","questions":["Audience?","Length?"]}' },
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]);
    const graph = buildWorkflow(p, statefulDeps(), checkpointer);
    const threadId = "p-interview";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } });

    // Paused at the discovery interview, not the script gate. The node pauses
    // INSIDE the interrupt() call, so stage is not yet set — the interrupt value
    // and the next node are the reliable signals.
    const paused = await graph.getState({ configurable: { thread_id: threadId } });
    const interruptValues = (paused.tasks ?? []).flatMap((t: { interrupts?: { value?: unknown }[] }) =>
      (t.interrupts ?? []).map((i) => i.value),
    );
    expect(interruptValues).toContain("discovery_questions");
    expect(paused.next).toContain("discovery"); // loop back for another planning pass

    // Resume with answers → planning produces a brief → script → review → gate.
    await resumeWorkflow(graph, threadId, ["general audience", "3 minutes"]);
    const after = await graph.getState({ configurable: { thread_id: threadId } });
    expect(after.values.brief).not.toBeNull();
    const afterInterrupts = (after.tasks ?? []).flatMap((t: { interrupts?: { value?: unknown }[] }) =>
      (t.interrupts ?? []).map((i) => i.value),
    );
    expect(afterInterrupts).toContain("script_review"); // paused again, at the script gate
  });
});
