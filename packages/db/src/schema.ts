import { pgTable, uuid, text, jsonb, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { Brief, ResearchPacket, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location } from "@slate/shared";

// Phase 1+2 Postgres schema (Task 4, ADR-011/013/022/023).
// No local `users` table (ADR-023) - Clerk owns identity; `owner_id` stores Clerk's
// `user_...` id and is REQUIRED (multi-user isolation from day one).
// Storyboard model (spec §12.9): storyboards + scenes carry VERSION ROWS - a
// reorder, edit, or prompt regeneration inserts new version rows; the latest
// version per (storyboard_id, order) is the current scene.
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(), // Clerk user id (ADR-023)
  idea: text("idea").notNull(),
  title: text("title"),
  stage: text("stage").notNull().default("discovery"),
  status: text("status").notNull().default("active"),
  conversation: jsonb("conversation").notNull().$type<{ role: "user" | "assistant"; content: string; at: string }[]>().default([]),
  brief: jsonb("brief").$type<Brief>(),
  briefHistory: jsonb("brief_history").notNull().$type<unknown[]>().default([]),
  researchPacket: jsonb("research_packet").$type<ResearchPacket>(),
  researchStatus: text("research_status").notNull().default("pending"),
  characters: jsonb("characters").notNull().$type<Character[]>().default([]),
  locations: jsonb("locations").notNull().$type<Location[]>().default([]),
  storyboardVersion: integer("storyboard_version").notNull().default(0),
  productionPlanStatus: text("production_plan_status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("projects_owner_id").on(t.ownerId)]);

export const scripts = pgTable("scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  content: jsonb("content").notNull().$type<ScriptContent>(),
  reviewScores: jsonb("review_scores").$type<ReviewScores>(),
  reviewNotes: text("review_notes"),
  createdBy: text("created_by").notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("scripts_project_version").on(t.projectId, t.version)]);

export const storyboards = pgTable("storyboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("storyboards_project_version").on(t.projectId, t.version)]);

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyboardId: uuid("storyboard_id").notNull().references(() => storyboards.id),
  order: integer("order").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").notNull().$type<SceneContent>(),
  promptPack: jsonb("prompt_pack").$type<PromptPack>(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("scenes_storyboard_order_version").on(t.storyboardId, t.order, t.version)]);

// Phase 3 Block 1 - per-scene generated media assets. One row per generation
// attempt; status moves pending → generating → ready | failed, so a failed
// attempt stays visible and retryable (the UI's regenerate path reads it).
// Assets hang off the SCENE row they were generated for - when a storyboard
// version bump mints new scene ids, the old rows' assets persist but the
// current scene's list starts fresh (same version-rows philosophy).
// Phase 3 Block 4 - render/export attempts. One row per render "take": the
// route inserts pending, runs the FFmpeg pipeline into
// <rendersDir>/<projectId>/<renderId>/, then updates to ready with the served
// URLs (or failed with the error). Same version-row philosophy as scenes.
export const renders = pgTable("renders", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  status: text("status").notNull().default("pending"), // RenderStatus
  mp4Url: text("mp4_url"),
  thumbnailUrl: text("thumbnail_url"),
  manifestUrl: text("manifest_url"),
  packageUrl: text("package_url"),
  error: text("error"),
  meta: jsonb("meta").notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("renders_project_id").on(t.projectId)]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sceneId: uuid("scene_id").notNull().references(() => scenes.id),
  kind: text("kind").notNull(), // image | video | voice | music (AssetKind)
  status: text("status").notNull().default("pending"), // AssetStatus
  url: text("url"),
  mimeType: text("mime_type"),
  provider: text("provider"),
  meta: jsonb("meta").notNull().$type<Record<string, unknown>>().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("assets_scene_id").on(t.sceneId)]);
