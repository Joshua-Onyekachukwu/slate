export const ProjectStage = {
  DISCOVERY: "discovery",
  BRIEF: "brief",
  RESEARCH: "research",
  SCRIPT: "script",
  STORYBOARD: "storyboard",
  DONE: "done",
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

export const StageStatus = { IDLE: "idle", RUNNING: "running", AWAITING_REVIEW: "awaiting_review", APPROVED: "approved", FAILED: "failed" } as const;
export type StageStatus = (typeof StageStatus)[keyof typeof StageStatus];

export const ScriptStatus = { DRAFT: "draft", APPROVED: "approved", REJECTED: "rejected" } as const;
export type ScriptStatus = (typeof ScriptStatus)[keyof typeof ScriptStatus];

export const CreatedBy = { AI: "ai", USER: "user" } as const;
export type CreatedBy = (typeof CreatedBy)[keyof typeof CreatedBy];

export const SceneStatus = { PENDING: "pending", APPROVED: "approved" } as const;
export type SceneStatus = (typeof SceneStatus)[keyof typeof SceneStatus];

export const StoryboardStatus = { DRAFT: "draft", APPROVED: "approved" } as const;
export type StoryboardStatus = (typeof StoryboardStatus)[keyof typeof StoryboardStatus];

export const ProductionPlanStatus = { DRAFT: "draft", READY: "ready" } as const;
export type ProductionPlanStatus = (typeof ProductionPlanStatus)[keyof typeof ProductionPlanStatus];
