import { StateGraph, START, END, interrupt, BaseCheckpointSaver } from "@langchain/langgraph";
import { WorkflowState } from "./state";
import { planningAgent, scriptAgent, reviewerAgent } from "../agents";
import type { Provider, ChatMessage } from "../providers/types";
import type { Brief, ScriptContent } from "@slate/shared";

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
      return { stage: "done" };
    })
    .addEdge(START, "discovery")
    .addConditionalEdges("discovery", (s) => (s.brief ? "write_script" : "discovery"))
    .addEdge("write_script", "review")
    .addEdge("review", "script_gate")
    .addConditionalEdges("script_gate", (s) => (s.stage === "done" ? END : "write_script"))
    .compile({ checkpointer });
}

export type WorkflowGraph = ReturnType<typeof buildWorkflow>;
