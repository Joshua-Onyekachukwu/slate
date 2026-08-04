import { Annotation } from "@langchain/langgraph";
import type { Brief, ScriptContent, ReviewScores } from "@slate/shared";

export const WorkflowState = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, b) => b }),
  stage: Annotation<string>({ reducer: (_, b) => b }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  script: Annotation<ScriptContent | null>({ reducer: (_, b) => b, default: () => null }),
  scores: Annotation<ReviewScores | null>({ reducer: (_, b) => b, default: () => null }),
  feedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});
export type WorkflowState = typeof WorkflowState.State;
