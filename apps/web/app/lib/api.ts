// Typed client for the slice API (api-design.md). The slice exposes:
// projects CRUD, script + storyboard approve/regenerate gates, script versions,
// the storyboard (scenes + prompt packs) with atomic reorder, SSE.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// --- Contract shapes (api-design.md "Stage approve / regenerate") ---

export interface ProjectRow {
  id: string;
  idea: string;
  title: string | null;
  stage: string; // checkpoint stage: "script_review" at the gate, "done" after approval
  status: string;
  brief: unknown;
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
    brief?: unknown;
    conversation?: { role: string; content: string; at: string }[];
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

interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only send content-type when there's a body: Fastify rejects an empty body
  // with content-type set ("Body cannot be empty") — e.g. the body-less
  // POST .../prompts/regenerate. GETs don't send it either.
  const hasBody = init?.body !== undefined && init.body !== null;
  const headers = hasBody ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers;
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
};
