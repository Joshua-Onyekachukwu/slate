import { pgTable, uuid, text, jsonb, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { Brief, ResearchPacket, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location } from "@slate/shared";

// No local `users` table (ADR-023) — Clerk owns identity; `owner_id` stores Clerk's `user_...` id.
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
}, (t) => [index("projects_owner_id_idx").on(t.ownerId)]);

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
