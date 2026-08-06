import { StateGraph, START, END, interrupt, BaseCheckpointSaver } from "@langchain/langgraph";
import { WorkflowState } from "./state";
import { planningAgent, researchAgent, scriptAgent, reviewerAgent, storyboardAgent, editorAgent, promptAgent, characterAgent, environmentAgent } from "../agents";
import type { Provider, ChatMessage } from "../providers/types";
import type { Brief, ScriptContent, SceneContent, PromptPack } from "@slate/shared";

export interface WorkflowDeps {
  getProject(id: string): Promise<{
    id: string;
    idea: string;
    conversation: ChatMessage[];
    stage: string;
    status: string;
    brief: Brief | null;
  }>;
  saveProject(id: string, patch: Record<string, unknown>): Promise<void>;
  saveScript(projectId: string, content: ScriptContent): Promise<void>;
  saveStoryboard(projectId: string, scenes: SceneContent[]): Promise<void>;
  savePromptPacks(projectId: string, packs: PromptPack[]): Promise<void>;
}

export function buildWorkflow(provider: Provider, deps: WorkflowDeps, checkpointer?: BaseCheckpointSaver) {
  // Single chained expression: langgraph 0.2.x addNode/addEdge return a widened
  // builder type, so the node-name union (N) only grows when the calls chain.
  return new StateGraph(WorkflowState)
    .addNode("discovery", async (state) => {
      const project = await deps.getProject(state.projectId);
      const result = await planningAgent(provider, project.idea, project.conversation);
      if (result.kind === "questions") {
        // Pause for the user's answers; resume value = string[] of answers.
        const answers = interrupt<string, string[]>("discovery_questions");
        await deps.saveProject(state.projectId, {
          conversation: [
            ...project.conversation,
            { role: "assistant", content: result.questions.join("\n"), at: new Date().toISOString() },
            { role: "user", content: answers.join("\n"), at: new Date().toISOString() },
          ],
        });
        return { stage: "discovery" };
      }
      await deps.saveProject(state.projectId, { brief: result.brief, stage: "brief" });
      return { stage: "brief", brief: result.brief };
    })
    // Research (Block 2): after the brief, produce the factual packet and pause
    // at a human gate before the script is written (plan topology: discovery →
    // brief → research → research_gate → script → ...). Rejecting loops back
    // here with feedback; the packet is overwritten on the project row.
    .addNode("research", async (state) => {
      const packet = await researchAgent(provider, state.brief as Brief, state.feedback);
      await deps.saveProject(state.projectId, { researchPacket: packet, researchStatus: "draft" });
      return { stage: "research", researchPacket: packet, feedback: undefined };
    })
    .addNode("research_gate", async (state) => {
      const decision = interrupt<string, { approved: boolean; feedback?: string }>("research_review");
      if (!decision?.approved) {
        return { feedback: decision?.feedback ?? "revise", stage: "research" };
      }
      await deps.saveProject(state.projectId, { researchStatus: "approved" });
      return { researchApproved: true };
    })
    // Node name can't be "script" — it collides with the `script` state channel.
    .addNode("write_script", async (state) => {
      const content = await scriptAgent(provider, state.brief as Brief, state.feedback);
      await deps.saveScript(state.projectId, content);
      return { stage: "script", script: content, feedback: undefined };
    })
    .addNode("review", async (state) => {
      const scores = await reviewerAgent(provider, state.script as ScriptContent);
      return { stage: "script_review", scores };
    })
    .addNode("script_gate", async (state) => {
      const decision = interrupt<string, { approved: boolean; feedback?: string }>("script_review");
      if (!decision?.approved) {
        return { feedback: decision?.feedback ?? "revise", stage: "script" };
      }
      // Approving the script moves into the storyboard stage — NOT straight to
      // done. The scriptApproved channel is the routing signal (a crash between
      // here and write_storyboard must NOT leave a premature "done" checkpoint);
      // write_storyboard overwrites stage with "storyboard" immediately after.
      return { scriptApproved: true };
    })
    // Consistency: after the script is approved, extract stable characters and
    // locations once, persist them on the project (crew sheet source of truth),
    // and carry them on the state so storyboard + prompt agents keep continuity.
    .addNode("consistency", async (state) => {
      const brief = state.brief as Brief;
      const script = state.script as ScriptContent;
      const characters = await characterAgent(provider, brief, script);
      const locations = await environmentAgent(provider, brief, script);
      await deps.saveProject(state.projectId, { characters, locations });
      return { characters, locations };
    })
    // Node name can't be "storyboard" — it collides with the storyboard state
    // channel (same reason the script node is "write_script").
    .addNode("write_storyboard", async (state) => {
      // Storyboard → Editor (per-scene transition/music) run back-to-back as one
      // production pass; the edited scenes are what get saved and reviewed.
      // The consistency records flow in here so scenes stay on-cast/on-location.
      const scenes = await storyboardAgent(provider, state.script as ScriptContent, state.characters, state.locations, state.feedback);
      const edited = await editorAgent(provider, scenes);
      await deps.saveStoryboard(state.projectId, edited);
      return { stage: "storyboard", storyboard: edited, feedback: undefined };
    })
    .addNode("prompt_gen", async (state) => {
      const packs: PromptPack[] = [];
      for (const scene of state.storyboard ?? []) {
        packs.push(await promptAgent(provider, scene, state.characters, state.locations));
      }
      await deps.savePromptPacks(state.projectId, packs);
      return { promptPacks: packs };
    })
    .addNode("storyboard_gate", async (state) => {
      const decision = interrupt<string, { approved: boolean; feedback?: string }>("storyboard_review");
      if (!decision?.approved) {
        return { feedback: decision?.feedback ?? "revise", stage: "storyboard" };
      }
      return { stage: "done" };
    })
    .addEdge(START, "discovery")
    .addConditionalEdges("discovery", (s) => (s.brief ? "research" : "discovery"))
    .addEdge("research", "research_gate")
    .addConditionalEdges("research_gate", (s) => (s.researchApproved ? "write_script" : "research"))
    .addEdge("write_script", "review")
    .addEdge("review", "script_gate")
    .addConditionalEdges("script_gate", (s) => (s.scriptApproved ? "consistency" : "write_script"))
    .addEdge("consistency", "write_storyboard")
    .addEdge("write_storyboard", "prompt_gen")
    .addEdge("prompt_gen", "storyboard_gate")
    .addConditionalEdges("storyboard_gate", (s) => (s.stage === "done" ? END : "write_storyboard"))
    .compile({ checkpointer });
}

export type WorkflowGraph = ReturnType<typeof buildWorkflow>;
