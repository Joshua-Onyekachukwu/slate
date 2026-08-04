"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_URL, type ProjectRow, type StageDetail } from "../../lib/api";

// Slice stages — mirrors the workflow's checkpoint journey (idea → approved script).
const SLICE_STAGES = [
  { key: "discovery", name: "Idea" },
  { key: "brief", name: "Brief" },
  { key: "script", name: "Script" },
  { key: "done", name: "Ready" },
];

const stageIndex = (checkpointStage: string | undefined): number => {
  if (checkpointStage === "done") return 3;
  if (checkpointStage === "script_review") return 2; // script gate (awaiting review)
  if (checkpointStage === "brief") return 1;
  return 0;
};

export function Workspace({ projectId, initialIdea }: { projectId: string; initialIdea?: string }) {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ project }, detail] = await Promise.all([
        api.getProject(projectId),
        api.getStageDetail(projectId, "script"),
      ]);
      setProject(project);
      setDetail(detail);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live stage events via SSE; fall back to polling if it fails to connect.
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_URL}/api/v1/projects/${projectId}/stream`);
      esRef.current = es;
      es.addEventListener("stage:done", () => refresh());
      es.addEventListener("stage:awaiting_review", () => refresh());
      es.onerror = () => {
        es?.close();
        poll = setInterval(refresh, 2000);
      };
    } catch {
      poll = setInterval(refresh, 2000);
    }
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [projectId, refresh]);

  const awaiting = detail?.stage?.status === "awaiting_review" && detail?.stage?.gate?.value === "script_review";
  const approved = detail?.stage?.status === "approved";

  const doApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.approve(projectId, "script", true);
      setProject((p) => (p ? { ...p, stage: res.project.stage ?? p.stage } : p));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRegenerate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.regenerate(projectId, "script", feedback.trim() || undefined);
      setFeedback("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scores = detail?.content.scores ?? null;
  const script = detail?.content.script ?? null;
  const current = stageIndex(project?.stage);

  return (
    <main>
      <section className="view-ws console">
        <div className="wrap">
          <div className="ws-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Project · PROJ {projectId.slice(0, 4).toUpperCase()}
              </div>
              <h1 className="ws-title">{initialIdea ?? project?.idea ?? "Untitled idea"}</h1>
              <div className="ws-meta">
                16:9 · documentary · NVIDIA/nvidia-llama-3.3-70b
                {approved && <span className="chip ok" style={{ marginLeft: 10 }}>Approved</span>}
              </div>
            </div>
          </div>

          {/* slate/timecode stepper */}
          <div className="stepper" role="tablist" aria-label="Production stages">
            {SLICE_STAGES.map((s, i) => {
              const cls = ["stage"];
              if (i < current) cls.push("approved");
              if (i === current) cls.push("live");
              return (
                <div key={s.key} className={cls.join(" ")} role="tab" aria-selected={i === current}>
                  <div className="tc">0{i + 1} · {s.key.toUpperCase()}</div>
                  <div className="nm">
                    {i === current && <span className="rec-dot"></span>}
                    {s.name}
                  </div>
                  <div className="st">{i < current ? "Approved" : i === current ? (approved ? "Approved" : "Awaiting review") : "—"}</div>
                </div>
              );
            })}
          </div>

          {error && <p className="api-note">API error: {error}</p>}
          {loading && <p className="api-note">Loading production state…</p>}

          {!loading && !error && (
            <div className="console-body">
              {/* left rail — call sheet */}
              <aside className="csheet">
                <div className="csheet-title">
                  <span className="lbl">Call sheet</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Project</span>
                  <span className="cs-vl">{projectId.slice(0, 8)}</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Stage</span>
                  <span className="cs-vl">{detail?.stage?.status ?? "—"}</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Version</span>
                  <span className="cs-vl">v{detail?.stage?.version ?? "—"}</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Gate</span>
                  <span className="cs-vl">{detail?.stage?.gate?.value ?? "none"}</span>
                </div>
              </aside>

              {/* main panel — the script on paper */}
              <div className="panel stage-fade">
                <div className="p-eyebrow">
                  {approved ? "Script · Approved" : awaiting ? "Script · Awaiting review" : "Script"}
                  {scores && (
                    <span className="score-chip">
                      OVERALL <b>{scores.overall}/5</b>
                      <span className="bar"><i style={{ width: `${scores.overall * 20}%` }}></i></span>
                    </span>
                  )}
                </div>

                {script ? (
                  <div className="script-edit">
                    <div className="script-title">{script.title}</div>
                    <div className="script-para lead" data-p="p0">
                      <em>{script.hook}</em>
                    </div>
                    <div className="script-para" data-p="p1">{script.introduction}</div>
                    {script.body.map((para, i) => (
                      <div key={i} className="script-para" data-p={`b${i}`}>
                        {para}
                      </div>
                    ))}
                    <div className="script-para" data-p="pc">{script.conclusion}</div>
                    {script.cta && <div className="script-para" data-p="pcta">▶ {script.cta}</div>}
                  </div>
                ) : (
                  <p className="lead" style={{ color: "#7a7265" }}>
                    {approved
                      ? "The script was approved. The production plan builds on this in the next phase."
                      : awaiting
                        ? "The script is written and scored — review it, then approve or ask for a retake."
                        : "The workflow is still running. This panel fills in as stages complete."}
                  </p>
                )}
              </div>

              {/* coverage rail */}
              <aside className="coverage">
                <div className="cov-card">
                  <div className="c-t">
                    <span>Review scores</span>
                    <span className="rec-dot"></span>
                  </div>
                  {scores ? (
                    <div style={{ marginTop: 12 }}>
                      {(Object.entries(scores) as [string, number][]).filter(([k]) => k !== "notes" && k !== "overall").map(([k, v]) => (
                        <div key={k} className="score-line">
                          <span className="nm">{k}</span>
                          <span className="val"><b>{v}/5</b></span>
                          <span className="bar"><i style={{ width: `${v * 20}%` }}></i></span>
                        </div>
                      ))}
                      {scores.notes.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 12, color: "var(--ash)" }}>
                          {scores.notes.map((n, i) => <div key={i}>— {n}</div>)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: "var(--ash)", fontSize: 12, marginTop: 12 }}>No scores yet.</p>
                  )}
                </div>

                <div className="cov-card">
                  <div className="c-t">
                    <span>Versions</span>
                  </div>
                  <p style={{ color: "var(--ash)", fontSize: 12, marginTop: 10 }}>
                    Latest: <b style={{ color: "var(--paper)" }}>v{detail?.stage?.version ?? "—"}</b>
                    {detail?.stage?.updatedAt ? ` · ${new Date(detail.stage.updatedAt).toLocaleTimeString()}` : ""}
                  </p>
                </div>
              </aside>
            </div>
          )}

          {/* fixed approve bar */}
          {!loading && !error && (
            <div className="gate-bar">
              <div className="gate-in">
                {awaiting ? (
                  <>
                    <div className="gate-note">
                      <span className="rec-dot"></span>
                      Script ready for review — approve to lock it, or send it back for a retake.
                    </div>
                    <div className="gate-actions">
                      <input
                        className="gate-feedback"
                        type="text"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Feedback for a retake (optional)"
                        aria-label="Retake feedback"
                      />
                      <button className="btn btn-ghost" onClick={doRegenerate} disabled={busy}>
                        Regenerate
                      </button>
                      <button className="btn btn-rec" onClick={doApprove} disabled={busy}>
                        {busy ? "Working…" : "Approve & continue"}
                      </button>
                    </div>
                  </>
                ) : approved ? (
                  <div className="gate-note">
                    <span className="chip ok">Approved</span>
                    Script v{detail?.stage?.version} locked — ready for the production plan.
                  </div>
                ) : (
                  <div className="gate-note">
                    <span className="rec-dot"></span>
                    Production running…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
