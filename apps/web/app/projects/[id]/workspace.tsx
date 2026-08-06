"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_URL, type ProjectRow, type StageDetail, type StoryboardView, type PromptPack, type SceneContent } from "../../lib/api";
import { SceneCard } from "../../components/scene-card";

// Slice stages — mirrors the workflow's checkpoint journey (idea → approved storyboard).
const SLICE_STAGES = [
  { key: "discovery", name: "Idea" },
  { key: "brief", name: "Brief" },
  { key: "script", name: "Script" },
  { key: "storyboard", name: "Storyboard" },
  { key: "done", name: "Ready" },
];

const stageIndex = (checkpointStage: string | undefined): number => {
  if (checkpointStage === "done") return 4;
  if (checkpointStage === "storyboard") return 3; // storyboard gate (awaiting review)
  if (checkpointStage === "script_review" || checkpointStage === "script") return 2;
  if (checkpointStage === "brief") return 1;
  return 0;
};

const PACK_TABS: { key: keyof PromptPack; label: string }[] = [
  { key: "imagePrompt", label: "Image" },
  { key: "videoPrompt", label: "Video" },
  { key: "narrationPrompt", label: "Narration" },
  { key: "musicPrompt", label: "Music" },
  { key: "sfxPrompt", label: "SFX" },
];

export function Workspace({ projectId, initialIdea }: { projectId: string; initialIdea?: string }) {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [sb, setSb] = useState<StoryboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showPacks, setShowPacks] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ project }, detail] = await Promise.all([
        api.getProject(projectId),
        api.getStageDetail(projectId, "script"),
      ]);
      setProject(project);
      setDetail(detail);
      // The storyboard 404s until the script is approved — that's expected.
      const st = await api.getStoryboard(projectId).catch(() => null);
      setSb(st?.storyboard ?? null);
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

  const stage = project?.stage; // checkpoint-derived (never the stale projects column)
  const atScriptGate = stage === "script_review";
  const atStoryboardGate = stage === "storyboard";
  const done = stage === "done";
  const awaiting = atScriptGate || atStoryboardGate;
  const approved = done;

  const doApprove = async (which: "script" | "storyboard") => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.approve(projectId, which, true);
      setProject((p) => (p ? { ...p, stage: res.project.stage ?? p.stage } : p));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRegenerate = async (which: "script" | "storyboard") => {
    if (busy) return;
    setBusy(true);
    try {
      await api.regenerate(projectId, which, feedback.trim() || undefined);
      setFeedback("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Drag-to-reorder: optimistic local move, persisted via the atomic reorder API.
  // The response MUST replace local state — the server creates NEW version rows
  // with new scene ids, so keeping the optimistic ids would fail the next
  // reorder's permutation check (stale-id bug caught in review).
  const moveScene = async (from: number, to: number) => {
    if (!sb || busy) return;
    const next = [...sb.scenes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSb({ ...sb, scenes: next }); // optimistic
    setBusy(true);
    try {
      const res = await api.reorderStoryboard(projectId, next.map((s) => s.id));
      setSb(res.storyboard); // canonical: new ids + order from the server
    } catch (e) {
      setError((e as Error).message);
      await refresh(); // revert to server truth
    } finally {
      setBusy(false);
    }
  };

  // Per-scene edit: PUT saves the edit as NEW version rows; the response MUST
  // replace local state (new scene ids, like reorder) or the next action 400s
  // on stale ids.
  const saveSceneContent = async (sceneId: string, content: SceneContent) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.saveScene(projectId, sceneId, content);
      setSb(res.storyboard); // canonical version rows from the server
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scores = detail?.content.scores ?? null;
  const script = detail?.content.script ?? null;
  const current = stageIndex(stage);

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
                  <div className="st">
                    {i < current ? "Approved" : i === current ? (approved ? "Approved" : "Awaiting review") : "—"}
                  </div>
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
                  <span className="cs-vl">{stage ?? "—"}</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Version</span>
                  <span className="cs-vl">
                    {atStoryboardGate ? `sb v${sb?.version ?? "—"}` : `v${detail?.stage?.version ?? "—"}`}
                  </span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Gate</span>
                  <span className="cs-vl">{atScriptGate ? "script_review" : atStoryboardGate ? "storyboard_review" : "none"}</span>
                </div>
              </aside>

              {/* main panel */}
              <div className="panel stage-fade">
                {atScriptGate && (
                  <>
                    <div className="p-eyebrow">
                      Script · Awaiting review
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
                      <p className="lead" style={{ color: "#7a7265" }}>The script is written and scored — review it, then approve or ask for a retake.</p>
                    )}
                  </>
                )}

                {(atStoryboardGate || done) && (
                  <>
                    <div className="p-eyebrow">
                      {done ? "Production plan" : "Storyboard · Awaiting review"}
                      {sb && (
                        <span className="score-chip" style={{ borderColor: "var(--line-paper)", color: "#5c554a" }}>
                          <b>{sb.scenes.length}</b> scenes · sb v{sb.version}
                        </span>
                      )}
                    </div>

                    {sb && (
                      <>
                        <div className="scene-list" style={{ marginBottom: 14 }}>
                          {sb.scenes.map((sc, i) => (
                            <SceneCard
                              key={sc.id}
                              index={i}
                              order={sc.order}
                              durationSeconds={sc.content.durationSeconds}
                              transition={sc.content.transition}
                              status={done ? "Approved" : "Scene"}
                              tone={done ? "default" : "rec"}
                              meta={`${sc.content.cameraDirection} · music: ${sc.content.musicCue}`}
                              onReorder={moveScene}
                              content={sc.content}
                              editing={editingId === sc.id}
                              onEdit={() => setEditingId(sc.id)}
                              onSave={(c) => saveSceneContent(sc.id, c)}
                              onCancel={() => setEditingId(null)}
                              saving={busy}
                            />
                          ))}
                        </div>

                        {/* prompt packs behind the advanced toggle */}
                        <button
                          className="mini-btn adv-toggle"
                          aria-expanded={showPacks}
                          onClick={() => setShowPacks((v) => !v)}
                        >
                          {showPacks ? "▾ Advanced — hide prompt packs" : "▸ Advanced — prompt packs"}
                        </button>
                        {showPacks && (
                          <div className="plan-section">
                            {sb.scenes.map((sc, i) => (
                              <div className="crew-card" key={sc.id} style={{ marginBottom: 10 }}>
                                <div className="k">SC {String(sc.order).padStart(2, "0")} · {sc.content.title}</div>
                                {sc.promptPack ? (
                                  <div className="v">
                                    {PACK_TABS.map((t) => (
                                      <div key={t.key} style={{ marginBottom: 6 }}>
                                        <b style={{ color: "var(--paper)" }}>{t.label}</b>
                                        <div style={{ color: "var(--ash)", fontSize: 12 }}>{sc.promptPack![t.key]}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="v">Prompt pack queued.</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {done && (
                          <div className="plan-section">
                            <h3>Scenes in order</h3>
                            {sb.scenes.map((sc, i) => (
                              <div className="plan-row" key={sc.id}>
                                <span className="idx">SC {String(i + 1).padStart(2, "0")}</span>
                                <span className="nm">{sc.content.title}</span>
                                <span className="ds">{sc.content.transition} · {sc.content.musicCue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {!atScriptGate && !atStoryboardGate && !done && (
                  <>
                    <div className="p-eyebrow">{approved ? "Script · Approved" : "Script"}</div>
                    <p className="lead" style={{ color: "#7a7265" }}>
                      The workflow is still running. This panel fills in as stages complete.
                    </p>
                  </>
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
                    Script: <b style={{ color: "var(--paper)" }}>v{detail?.stage?.version ?? "—"}</b>
                    {sb && (
                      <>
                        <br />
                        Storyboard: <b style={{ color: "var(--paper)" }}>sb v{sb.version}</b>
                      </>
                    )}
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
                      {atScriptGate
                        ? "Script ready for review — approve to lock it and storyboard, or send it back for a retake."
                        : "Scenes storyboarded — drag to reorder, then approve to lock the production plan."}
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
                      <button className="btn btn-ghost" onClick={() => doRegenerate(atScriptGate ? "script" : "storyboard")} disabled={busy}>
                        Regenerate
                      </button>
                      <button className="btn btn-rec" onClick={() => doApprove(atScriptGate ? "script" : "storyboard")} disabled={busy}>
                        {busy ? "Working…" : "Approve & continue"}
                      </button>
                    </div>
                  </>
                ) : approved ? (
                  <div className="gate-note">
                    <span className="chip ok">Approved</span>
                    Production plan locked — {sb?.scenes.length ?? 0} scenes, prompt packs set.
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
