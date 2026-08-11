// Typed client for the slice API (api-design.md). The slice exposes:
// projects CRUD, script + storyboard approve/regenerate gates, script versions,
// the storyboard (scenes + prompt packs) with atomic reorder, SSE.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// --- Auth (Task 2, ADR-022/023) — Clerk session JWT attached when present ---
// Local/slice mode (no Clerk keys): bearerToken stays null and requests go out
// bare, exactly as before (the E2E and zero-key demo run that way). Enforced
// mode: AuthBridge installs a token gate and every /api/v1 request first awaits
// it, then carries `Authorization: Bearer <jwt>`, which the API's requireUser
// hook verifies and scopes by owner_id.
//
// CLIENT-ONLY: this module's state is per-browser-tab. Do NOT import it from a
// server component — module-level bearerToken would then persist across users
// in the server process and could leak one user's token into another's SSR.
let bearerToken: string | null = null;

// The gate: once installed, request() awaits it so the first dashboard fetch
// never fires before the Clerk session token is available (which would 401 in
// enforced mode and leave a permanent error banner). null = local mode, no
// gate, requests fire immediately.
let tokenGate: Promise<string | null> | null = null;
let tokenGateInstalled = false;

// Installed by AuthBridge during its first render — before ANY component's
// effect runs (renders complete before effects flush), so every request from
// a page effect is guaranteed to wait for the token. Idempotent: StrictMode
// double-renders call it twice with the same getToken.
export function installTokenGate(getToken: () => Promise<string | null>) {
  if (tokenGateInstalled) return;
  tokenGateInstalled = true;
  tokenGate = getToken().then((token) => {
    bearerToken = token;
    return token;
  });
  // A failed load must not hang every future request — drop the gate and go
  // bare rather than leave an unhandled rejection or a stuck promise.
  tokenGate.catch(() => {
    bearerToken = null;
  });
}

// Keeps the token in sync on sign-in/sign-out (getToken identity changes when
// the session changes) and clears it when the session ends.
export function setAuthToken(token: string | null) {
  bearerToken = token;
}

// --- Contract shapes (api-design.md "Stage approve / regenerate") ---

export interface Brief {
  topic: string;
  audience: string;
  platform: string;
  style: string;
  durationSeconds: number;
  tone: string;
  narration: string;
  aspectRatio: string;
}

export interface ProjectRow {
  id: string;
  idea: string;
  title: string | null;
  stage: string; // checkpoint stage: "script_review" at the gate, "done" after approval
  status: string;
  brief: Brief | null;
  conversation: { role: "user" | "assistant"; content: string; at: string }[];
  // Consistency records (crew sheet) — persisted after script approval.
  characters: CharacterRecord[];
  locations: LocationRecord[];
  updatedAt: string;
  createdAt: string;
}

export type StageStatus = "idle" | "running" | "awaiting_review" | "approved" | "failed";

export interface StageView {
  key: string;
  status: StageStatus;
  version: number | null;
  updatedAt: string | null;
  gate: { value: string } | null;
}

// GET /stages/:stage returns { project, stage, content } — stage is NESTED.
export interface StageDetail {
  project: { id: string; stage: string | undefined };
  stage: StageView;
  content: {
    brief?: Brief | null;
    conversation?: { role: string; content: string; at: string }[];
    research?: ResearchPacket | null;
    script?: { title: string; hook: string; introduction: string; body: string[]; conclusion: string; cta: string | null } | null;
    scores?: { clarity: number; pacing: number; engagement: number; retention: number; redundancy: number; overall: number; notes: string[] } | null;
    storyboard?: { version: number; scenes: StoryboardScene[] } | null;
  };
}

export interface SceneContent {
  title: string;
  narration: string;
  visualDescription: string;
  cameraDirection: string;
  durationSeconds: number;
  transition: string;
  musicCue: string;
}

export interface PromptPack {
  imagePrompt: string;
  videoPrompt: string;
  narrationPrompt: string;
  musicPrompt: string;
  sfxPrompt: string;
}

export interface ResearchPacket {
  timeline: string[];
  concepts: string[];
  terminology: Record<string, string>;
  references: string[];
  keyEvents: string[];
}

export interface StoryboardScene {
  id: string;
  order: number;
  content: SceneContent;
  promptPack: PromptPack | null;
}

export interface StoryboardView {
  version: number;
  status: "draft" | "approved";
  scenes: StoryboardScene[];
}

export interface CharacterRecord {
  id: string;
  name: string;
  description: string;
}

export interface LocationRecord {
  id: string;
  name: string;
  description: string;
}

// Phase 3 Block 1/2 — a generated media asset (mirrors the API's `assets`
// rows). `meta.quality` carries the per-asset quality gate: { score 1–5, notes }.
export type AssetKind = "image" | "video" | "voice" | "music";
export type AssetStatus = "pending" | "generating" | "ready" | "failed";

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

export const ASSET_KINDS: AssetKind[] = ["image", "video", "voice", "music"];
export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  image: "IMG",
  video: "VID",
  voice: "VO",
  music: "MUS",
};

export function assetQuality(asset: Asset): { score: number; notes: string[] } | null {
  const q = asset.meta?.quality as { score?: unknown; notes?: unknown } | null | undefined;
  if (!q || typeof q.score !== "number") return null;
  return { score: q.score, notes: Array.isArray(q.notes) ? (q.notes as string[]) : [] };
}

interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only send content-type when there's a body: Fastify rejects an empty body
  // with content-type set ("Body cannot be empty") — e.g. the body-less
  // POST .../prompts/regenerate. GETs don't send it either.
  // Enforced mode only: wait for the Clerk session token before firing.
  if (tokenGate) await tokenGate.catch(() => null);

  const hasBody = init?.body !== undefined && init.body !== null;
  // Flatten to a plain record first: init?.headers may be a Headers object or
  // string[][], which can't be annotated Record<string, string> directly.
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (hasBody) headers["content-type"] = "application/json";
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    const err = new Error(body.error?.message ?? `API ${res.status}`);
    (err as Error & { code?: string }).code = body.error?.code ?? "INTERNAL";
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  createProject(idea: string) {
    return request<{ project: ProjectRow }>("/api/v1/projects", { method: "POST", body: JSON.stringify({ idea }) });
  },
  listProjects() {
    return request<{ projects: ProjectRow[] }>("/api/v1/projects");
  },
  getProject(id: string) {
    return request<{ project: ProjectRow }>(`/api/v1/projects/${id}`);
  },
  getStageDetail(id: string, stage = "script") {
    return request<StageDetail>(`/api/v1/projects/${id}/stages/${stage}`);
  },
  approve(id: string, stage: string, approved: boolean, feedback?: string) {
    return request<{ project: { id: string; stage: string | undefined }; stage: StageView }>(
      `/api/v1/projects/${id}/stages/${stage}/approve`,
      { method: "POST", body: JSON.stringify({ approved, feedback }) },
    );
  },
  regenerate(id: string, stage: string, feedback?: string) {
    return request<{ project: { id: string; stage: string | undefined }; stage: StageView }>(
      `/api/v1/projects/${id}/stages/${stage}/regenerate`,
      { method: "POST", body: JSON.stringify({ feedback }) },
    );
  },
  getStoryboard(id: string) {
    // null until the script is approved — the workspace handles it.
    return request<{ storyboard: StoryboardView | null }>(`/api/v1/projects/${id}/storyboard`);
  },
  reorderStoryboard(id: string, sceneIds: string[]) {
    return request<{ storyboard: StoryboardView }>(`/api/v1/projects/${id}/storyboard/order`, {
      method: "PUT",
      body: JSON.stringify({ scene_ids: sceneIds }),
    });
  },
  // Per-scene edit → the API returns the new storyboard version; the response
  // MUST replace local state (new version rows = new scene ids, like reorder).
  saveScene(projectId: string, sceneId: string, content: SceneContent) {
    return request<{ storyboard: StoryboardView }>(`/api/v1/projects/${projectId}/scenes/${sceneId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  },
  // Per-scene prompt regeneration → same contract: the response replaces local
  // state (whole-storyboard version bump = new scene ids).
  regenerateScenePrompts(projectId: string, sceneId: string) {
    return request<{ storyboard: StoryboardView }>(
      `/api/v1/projects/${projectId}/scenes/${sceneId}/prompts/regenerate`,
      { method: "POST" },
    );
  },
  // Manual prompt-pack edit (PUT .../prompts with { promptPack }) → new version
  // rows; same response-replaces-state contract as regenerate/edit/reorder.
  saveScenePrompts(projectId: string, sceneId: string, promptPack: PromptPack) {
    return request<{ storyboard: StoryboardView }>(
      `/api/v1/projects/${projectId}/scenes/${sceneId}/prompts`,
      { method: "PUT", body: JSON.stringify({ promptPack }) },
    );
  },
  // Phase 3 Block 1/2 — per-scene media assets. Generation is synchronous with
  // the fake provider; the quality gate rides in asset.meta.quality. A failed
  // generation 502s but still PERSISTS a failed row — re-list to surface it.
  listAssets(projectId: string, sceneId: string) {
    return request<{ assets: Asset[] }>(`/api/v1/projects/${projectId}/scenes/${sceneId}/assets`);
  },
  generateAsset(projectId: string, sceneId: string, kind: AssetKind) {
    return request<{ asset: Asset }>(
      `/api/v1/projects/${projectId}/scenes/${sceneId}/assets`,
      { method: "POST", body: JSON.stringify({ kind }) },
    );
  },
};
