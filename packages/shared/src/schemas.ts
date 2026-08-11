import { z } from "zod";
import type { AssetKind, AssetStatus } from "./enums";

export const BriefSchema = z.object({
  topic: z.string().min(1),
  audience: z.string().min(1),
  platform: z.string().min(1),
  style: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  tone: z.string().min(1),
  narration: z.string().min(1),
  aspectRatio: z.string().min(1),
});
export type Brief = z.infer<typeof BriefSchema>;

export const ResearchPacketSchema = z.object({
  timeline: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  terminology: z.record(z.string()).default({}),
  references: z.array(z.string()).default([]),
  keyEvents: z.array(z.string()).default([]),
});
export type ResearchPacket = z.infer<typeof ResearchPacketSchema>;

export const ScriptContentSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  introduction: z.string().min(1),
  body: z.array(z.string()).min(1),
  conclusion: z.string().min(1),
  cta: z.string().nullable().default(null),
});
export type ScriptContent = z.infer<typeof ScriptContentSchema>;

export const ReviewScoresSchema = z.object({
  clarity: z.number().min(1).max(5),
  pacing: z.number().min(1).max(5),
  engagement: z.number().min(1).max(5),
  retention: z.number().min(1).max(5),
  redundancy: z.number().min(1).max(5),
  notes: z.array(z.string()).default([]),
  overall: z.number().min(1).max(5),
});
export type ReviewScores = z.infer<typeof ReviewScoresSchema>;

export const SceneContentSchema = z.object({
  title: z.string().min(1),
  narration: z.string().min(1),
  visualDescription: z.string().min(1),
  cameraDirection: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  transition: z.string().min(1),
  musicCue: z.string().min(1),
});
export type SceneContent = z.infer<typeof SceneContentSchema>;

export const PromptPackSchema = z.object({
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  narrationPrompt: z.string().min(1),
  musicPrompt: z.string().min(1),
  sfxPrompt: z.string().min(1),
});
export type PromptPack = z.infer<typeof PromptPackSchema>;

export const CharacterSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1) });
export type Character = z.infer<typeof CharacterSchema>;

export const LocationSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1) });
export type Location = z.infer<typeof LocationSchema>;

// Phase 3 Block 1 — a generated media asset row (mirrors the db `assets`
// table; the API returns it verbatim so the web client types against this).
export interface Asset {
  id: string;
  sceneId: string;
  kind: AssetKind;
  status: AssetStatus;
  url: string | null;
  mimeType: string | null;
  provider: string | null;
  meta: Record<string, unknown>;
  error: string | null;
  createdAt: string;
}
