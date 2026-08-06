import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type { Brief, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location, ResearchPacket } from "@slate/shared";

// Vertical slice (ADR-024): sqlite dialect, single-user, no auth.
// SQLite mapping per ADR-014: uuid → text PK, jsonb → text with { mode: "json" },
// timestamptz → integer timestamp_ms.
// Storyboard model (spec §12.9): storyboards + scenes carry VERSION ROWS — a
// reorder, edit, or prompt regeneration inserts new version rows; the latest
// version per (storyboard_id, order) is the current scene.
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    idea: text("idea").notNull(),
    title: text("title"),
    stage: text("stage").notNull().default("discovery"),
    status: text("status").notNull().default("active"),
    // Multi-user isolation (ADR-022/023): Clerk owns identity; this stores the
    // Clerk user id (user_...). Slice/local mode writes 'local' (NOT NULL
    // DEFAULT) so zero-container demos and the E2E run without a session.
    ownerId: text("owner_id").notNull().default("local"),
  conversation: text("conversation", { mode: "json" }).notNull().$type<{ role: "user" | "assistant"; content: string; at: string }[]>().default([]),
  brief: text("brief", { mode: "json" }).$type<Brief>(),
  // Consistency records (ADR-022 crew sheet): extracted after script approval,
  // carried on the project so storyboard/prompt agents and the crew sheet read
  // the same source of truth.
  characters: text("characters", { mode: "json" }).notNull().$type<Character[]>().default([]),
  locations: text("locations", { mode: "json" }).notNull().$type<Location[]>().default([]),
  // Research stage (Block 2): the research agent's packet lives on the project
  // row (database-schema.md — jsonb on projects, not a table). researchStatus
  // is the column-level source of truth; the workflow ALSO pauses at a
  // research_gate for human review before the script is written.
  researchPacket: text("research_packet", { mode: "json" }).$type<ResearchPacket>(),
  researchStatus: text("research_status").notNull().default("pending"),
  briefHistory: text("brief_history", { mode: "json" }).notNull().$type<unknown[]>().default([]),    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (t) => [index("projects_owner_id").on(t.ownerId)],
);

export const scripts = sqliteTable(
  "scripts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    version: integer("version").notNull(),
    content: text("content", { mode: "json" }).notNull().$type<ScriptContent>(),
    reviewScores: text("review_scores", { mode: "json" }).$type<ReviewScores>(),
    reviewNotes: text("review_notes"),
    createdBy: text("created_by").notNull().default("ai"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scripts_project_version").on(t.projectId, t.version)],
);

export const storyboards = sqliteTable(
  "storyboards",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    version: integer("version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("storyboards_project_version").on(t.projectId, t.version)],
);

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    storyboardId: text("storyboard_id").notNull().references(() => storyboards.id),
    order: integer("order").notNull(),
    version: integer("version").notNull(),
    content: text("content", { mode: "json" }).notNull().$type<SceneContent>(),
    promptPack: text("prompt_pack", { mode: "json" }).$type<PromptPack>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scenes_storyboard_order_version").on(t.storyboardId, t.order, t.version)],
);
