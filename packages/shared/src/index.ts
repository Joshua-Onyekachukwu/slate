// @videogen/shared — shared enums, types, and zod schemas.
// Task 3 fills these in; this placeholder keeps the workspace wiring green.

export const PROJECT_STAGES = [
  "idea",
  "brief",
  "research",
  "script",
  "storyboard",
  "scenes",
  "prompts",
  "ready",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const VERSION = "0.0.0";
