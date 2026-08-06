import { Annotation } from "@langchain/langgraph";
import type { Brief, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location, ResearchPacket } from "@slate/shared";

export const WorkflowState = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, b) => b }),
  stage: Annotation<string>({ reducer: (_, b) => b }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  researchPacket: Annotation<ResearchPacket | null>({ reducer: (_, b) => b, default: () => null }),
  script: Annotation<ScriptContent | null>({ reducer: (_, b) => b, default: () => null }),
  scores: Annotation<ReviewScores | null>({ reducer: (_, b) => b, default: () => null }),
  feedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  // Routing signal: set by the RESEARCH gate on approve (mirrors scriptApproved
  // — research approve routes to write_script; reject loops back to research).
  researchApproved: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  // Routing signal: set by the script gate on approve. Keeps the stage value
  // clean (no premature "done" between the gate and write_storyboard — a crash
  // in that window would otherwise leave a "done" checkpoint with no storyboard).
  scriptApproved: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  storyboard: Annotation<SceneContent[] | null>({ reducer: (_, b) => b, default: () => null }),
  promptPacks: Annotation<PromptPack[] | null>({ reducer: (_, b) => b, default: () => null }),
  // Consistency records: produced once per script approval by the consistency
  // node (characterAgent + environmentAgent), then threaded into the storyboard
  // and prompt agents so every scene draws from the same cast/locations.
  characters: Annotation<Character[]>({ reducer: (_, b) => b, default: () => [] }),
  locations: Annotation<Location[]>({ reducer: (_, b) => b, default: () => [] }),
  // Production plan lifecycle (Task 9): flips to "ready" when the storyboard
  // gate approves — the consolidated production-plan endpoint reads it from
  // the project row (persisted by the gate's saveProject patch).
  productionPlanStatus: Annotation<string>({ reducer: (_, b) => b, default: () => "draft" }),
});
export type WorkflowState = typeof WorkflowState.State;
