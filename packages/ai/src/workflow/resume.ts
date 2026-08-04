import { Command } from "@langchain/langgraph";
import type { WorkflowGraph } from "./graph";

export type ResumeValue = { approved: boolean; feedback?: string } | string[];

export async function resumeWorkflow(
  graph: WorkflowGraph,
  threadId: string,
  resume: ResumeValue,
): Promise<Record<string, unknown>> {
  const result = await graph.invoke(new Command({ resume }), { configurable: { thread_id: threadId } });
  return result as Record<string, unknown>;
}
