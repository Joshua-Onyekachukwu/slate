import { Annotation } from "@langchain/langgraph";
import type { Brief, ScriptContent, ReviewScores, SceneContent, PromptPack } from "@slate/shared";

export const WorkflowState = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, b) => b }),
  stage: Annotation<string>({ reducer: (_, b) => b }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  script: Annotation<ScriptContent | null>({ reducer: (_, b) => b, default: () => null }),
  scores: Annotation<ReviewScores | null>({ reducer: (_, b) => b, default: () => null }),
  feedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  // Routing signal: set by the script gate on approve. Keeps the stage value
  // clean (no premature "done" between the gate and write_storyboard — a crash
  // in that window would otherwise leave a "done" checkpoint with no storyboard).
  scriptApproved: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  storyboard: Annotation<SceneContent[] | null>({ reducer: (_, b) => b, default: () => null }),
  promptPacks: Annotation<PromptPack[] | null>({ reducer: (_, b) => b, default: () => null }),
});
export type WorkflowState = typeof WorkflowState.State;
