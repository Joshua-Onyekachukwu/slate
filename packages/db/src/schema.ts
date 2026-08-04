import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Brief, ScriptContent, ReviewScores } from "@slate/shared";

// Vertical slice (ADR-024): 2 tables, no auth (slice is single-user), sqlite dialect.
// SQLite mapping per ADR-014: uuid → text PK, jsonb → text with { mode: "json" },
// timestamptz → integer timestamp_ms.
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  idea: text("idea").notNull(),
  title: text("title"),
  stage: text("stage").notNull().default("discovery"),
  status: text("status").notNull().default("active"),
  conversation: text("conversation", { mode: "json" }).notNull().$type<{ role: "user" | "assistant"; content: string; at: string }[]>().default([]),
  brief: text("brief", { mode: "json" }).$type<Brief>(),
  briefHistory: text("brief_history", { mode: "json" }).notNull().$type<unknown[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

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
