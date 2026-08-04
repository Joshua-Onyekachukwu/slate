// Typed client for the vertical-slice API (api-design.md). The slice exposes:
// projects CRUD, the script approve/regenerate gate, script versions, SSE.

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
  };
}

interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
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
};
