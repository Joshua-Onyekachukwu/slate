"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api, API_URL, type ProjectRow, type StageDetail, type StoryboardView, type PromptPack, type SceneContent,
  type ResearchPacket, type Brief, type Asset, type AssetKind, type RenderRow, ASSET_KINDS, ASSET_KIND_LABEL, assetQuality,
} from "../../lib/api";
import { SceneCard } from "../../components/scene-card";
import { SceneFrame } from "../../components/scene-frame";
import { StatusCard } from "../../components/status-card";
import { Toast, type ToastData } from "../../components/toast";
import { DiscoveryChat } from "../../components/discovery-chat";
import { FilmMontage } from "../../components/film-montage";

// Slice stages - mirrors the workflow's checkpoint journey (idea → approved
// storyboard). Research (Block 2) sits between the brief and the script as its
// own reviewable gate.
const SLICE_STAGES = [
  { key: "discovery", name: "Idea" },
  { key: "brief", name: "Brief" },
  { key: "research", name: "Research" },
  { key: "script", name: "Script" },
  { key: "storyboard", name: "Storyboard" },
  { key: "done", name: "Ready" },
];

// Checkpoint stage values are intentionally asymmetric: the research gate's
// checkpoint value is "research" (its gate value), while the script gate's is
// "script_review" (named after the review node). Don't "normalize" this  - 
// GATE_VALUE_BY_STAGE in apps/api pins both shapes.
const stageIndex = (checkpointStage: string | undefined): number => {
  if (checkpointStage === "done") return 5;
  if (checkpointStage === "storyboard") return 4; // storyboard gate (awaiting review)
  if (checkpointStage === "script_review" || checkpointStage === "script") return 3;
  if (checkpointStage === "research") return 2; // research gate (awaiting review)
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

// HH:MM:SS - the approved prototype's briefPanel() shows "00:04:30" for 270s.
const formatDuration = (seconds: number): string =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

export function Workspace({ projectId, initialIdea }: { projectId: string; initialIdea?: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(null);
  // Other productions for the call sheet rail - the most recently updated
  // projects, newest first, excluding the one we're standing in.
  const [recentProjects, setRecentProjects] = useState<ProjectRow[]>([]);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [research, setResearch] = useState<ResearchPacket | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [sb, setSb] = useState<StoryboardView | null>(null);
  // Phase 3 Block 2 - per-scene generated assets, keyed by the CURRENT scene id.
  // Version bumps (edit/regen/reorder) mint new scene ids, so the map resets
  // with each adopted storyboard view.
  const [assetsByScene, setAssetsByScene] = useState<Record<string, Asset[]>>({});
  // Phase 3 Block 4 - rendered cuts of the locked plan, newest first.
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [playId, setPlayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transient action failures (approve / regenerate / asset generation / render)
  // surface as a toast with its own retry - the workspace stays visible. The
  // fatal `error` above is reserved for load failures that leave no data to
  // render.
  const [toast, setToast] = useState<ToastData | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const fail = (message: string, retry?: () => void) => {
    setToast({ message, retry });
  };
  const [feedback, setFeedback] = useState("");
  const [showPacks, setShowPacks] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [packDraft, setPackDraft] = useState<PromptPack | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ project }, detail, { renders }, { projects }] = await Promise.all([
        api.getProject(projectId),
        api.getStageDetail(projectId, "script"),
        // Renders 404 only for unknown projects (the owner check already ran) -
        // an empty list is the normal pre-lock state.
        api.listRenders(projectId).catch(() => ({ renders: [] })),
        // Call-sheet rail - never fatal; empty on failure.
        api.listProjects().catch(() => ({ projects: [] })),
      ]);
      setProject(project);
      setDetail(detail);
      setRenders(renders);
      setRecentProjects(
        [...projects]
          .filter((p) => p.id !== projectId)
          .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
          .slice(0, 4),
      );
      // Research packet for the research gate view (null until research runs).
      const researchDetail = await api.getStageDetail(projectId, "research").catch(() => null);
      setResearch(researchDetail?.content?.research ?? null);
      // The approved creative brief (produced by discovery, persisted on the
      // project row) - rendered above the packet at the research gate.
      const briefDetail = await api.getStageDetail(projectId, "brief").catch(() => null);
      setBrief(briefDetail?.content?.brief ?? null);
      // The storyboard 404s until the script is approved - that's expected.
      const st = await api.getStoryboard(projectId).catch(() => null);
      setSb(st?.storyboard ?? null);
      // Phase 3 Block 2 - per-scene assets for the CURRENT storyboard rows.
      if (st?.storyboard) {
        const entries = await Promise.all(
          st.storyboard.scenes.map(async (sc) => {
            const { assets } = await api.listAssets(projectId, sc.id).catch(() => ({ assets: [] }));
            return [sc.id, assets] as const;
          }),
        );
        setAssetsByScene(Object.fromEntries(entries));
      }
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
  // Creative discovery: the planning agent paused with questions (the stage
  // column is still undefined while interrupted, so pendingGates is the signal).
  const atDiscovery = (project?.pendingGates ?? []).includes("discovery_questions");
  const atResearchGate = stage === "research";
  const atScriptGate = stage === "script_review";
  const atStoryboardGate = stage === "storyboard";
  const done = stage === "done";
  const awaiting = atResearchGate || atScriptGate || atStoryboardGate;
  const approved = done;

  // Safety net: a fresh mount of an already-locked plan with no cut (the
  // render never ran or persisted nothing) auto-attempts once. Pinned per
  // mount via the ref; during the approve flow the `busy` guard inside
  // doRender makes this a no-op, so doApprove's own auto-render stays the
  // single source of truth for the lock transition.
  const autoRenderRef = useRef(false);
  useEffect(() => {
    if (autoRenderRef.current) return;
    if (!done || loading || !!error) return;
    if (renderBusy || !!renderError) return;
    autoRenderRef.current = true;
    if (renders.length === 0) doRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps - doRender is
    // intentionally called once; the ref pins the attempt.
  }, [done, loading, error, renderBusy, renderError, renders.length, doRender]);

  const doApprove = async (which: "research" | "script" | "storyboard") => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.approve(projectId, which, true);
      setProject((p) => (p ? { ...p, stage: res.project.stage ?? p.stage } : p));
      await refresh();
      // Auto-render the first cut the moment the plan locks: after the
      // storyboard approve lands and refresh settles, if the plan is done and
      // no cut exists yet, kick the render so the film waits in THE FILM panel
      // without an export click. The mount effect below usually fires first
      // (right after setProject flips to done); this inline pass is the
      // deterministic safety net that re-checks the fresh render list. A
      // failed render persists a failed row, so later checks see a non-empty
      // list and never re-fire.
      if (which === "storyboard" && res.project.stage === "done") {
        const { renders: latest } = await api.listRenders(projectId).catch(() => ({ renders: [] as RenderRow[] }));
        setRenders(latest);
        if (latest.length === 0) {
          // `busy` stays held until the finally - the film panel's Export
          // button shows "Rendering…" through the auto-render.
          await doRender();
        }
      }
    } catch (e) {
      fail((e as Error).message, () => doApprove(which));
    } finally {
      setBusy(false);
    }
  };

  const doRegenerate = async (which: "research" | "script" | "storyboard") => {
    if (busy) return;
    setBusy(true);
    try {
      await api.regenerate(projectId, which, feedback.trim() || undefined);
      setFeedback("");
      await refresh();
    } catch (e) {
      fail((e as Error).message, () => doRegenerate(which));
    } finally {
      setBusy(false);
    }
  };

  // Drag-to-reorder: optimistic local move, persisted via the atomic reorder API.
  // The response MUST replace local state - the server creates NEW version rows
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
      resetAssetsFor(res.storyboard); // new version rows → assets start empty
    } catch (e) {
      fail((e as Error).message, () => moveScene(from, to));
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
      resetAssetsFor(res.storyboard);
      setEditingId(null);
    } catch (e) {
      fail((e as Error).message, () => saveSceneContent(sceneId, content));
    } finally {
      setBusy(false);
    }
  };

  // Per-scene prompt regeneration: fresh pack via promptAgent (threaded with
  // the project's characters/locations), saved as new version rows. Same
  // response-replaces-state rule as edit/reorder.
  const regeneratePack = async (sceneId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.regenerateScenePrompts(projectId, sceneId);
      setSb(res.storyboard); // canonical version rows from the server
      resetAssetsFor(res.storyboard);
    } catch (e) {
      fail((e as Error).message, () => regeneratePack(sceneId));
    } finally {
      setBusy(false);
    }
  };

  // Manual prompt-pack edit: the Advanced panel's Edit mode collects a draft
  // pack, then PUTs it as new version rows (same response-replaces-state rule
  // as regenerate - the save handler swaps the whole storyboard view in).
  const startPackEdit = (sceneId: string, pack: PromptPack) => {
    setEditingPackId(sceneId);
    setPackDraft({ ...pack });
  };

  const savePack = async (sceneId: string) => {
    if (busy || !packDraft) return;
    setBusy(true);
    try {
      const res = await api.saveScenePrompts(projectId, sceneId, packDraft);
      setSb(res.storyboard); // canonical version rows from the server
      resetAssetsFor(res.storyboard);
      setEditingPackId(null);
      setPackDraft(null);
    } catch (e) {
      fail((e as Error).message, () => savePack(sceneId));
    } finally {
      setBusy(false);
    }
  };

  // Version-bump handlers (edit/regen/reorder/save-pack) adopt a NEW storyboard
  // view whose scene ids are fresh rows - their assets start empty; drop the
  // stale map so the UI never shows a dead version's assets under new ids.
  const resetAssetsFor = (view: StoryboardView) => {
    setAssetsByScene((m) => {
      const next: Record<string, Asset[]> = {};
      for (const sc of view.scenes) next[sc.id] = [];
      return next;
    });
  };

  // Phase 3 Block 2 - generate one asset kind for a scene. Generation is
  // synchronous with the fake provider; a failed generation 502s but still
  // PERSISTS a failed row, so re-list to surface it (visible + retryable).
  const generateAsset = async (sceneId: string, kind: AssetKind) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.generateAsset(projectId, sceneId, kind);
    } catch (e) {
      fail((e as Error).message, () => generateAsset(sceneId, kind));
    } finally {
      // Re-list regardless: success appends, failure surfaces the persisted row.
      const { assets } = await api.listAssets(projectId, sceneId).catch(() => ({ assets: [] }));
      setAssetsByScene((m) => ({ ...m, [sceneId]: assets }));
      setBusy(false);
    }
  };

  // Creative discovery - answer the planning agent's interview questions and
  // let the workflow advance to the brief. Failures surface as a toast with a
  // retry that re-sends the same answer (the API only persists the answer if
  // the resume succeeds, so retrying is safe).
  const sendAnswer = async (content: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.sendMessage(projectId, content);
      await refresh();
    } catch (e) {
      fail((e as Error).message, () => sendAnswer(content));
    } finally {
      setBusy(false);
    }
  };

  // Phase 3 Block 4 - render the LOCKED plan into a film. Rendering is
  // synchronous in the MVP (fake provider returns instantly); a failed render
  // (ffmpeg missing, non-zero exit) persists a failed row the list surfaces.
  // Hoisted function declaration (not const) so doApprove's plan-lock
  // auto-render can call it before this point in the file. Only renderBusy
  // guards re-entry: the caller (Export button or the auto-render inside
  // doApprove) already holds `busy`, so checking it here would make the
  // auto-render a silent no-op.
  async function doRender() {
    if (renderBusy) return;
    setRenderBusy(true);
    setRenderError(null);
    try {
      const { render } = await api.renderProject(projectId);
      const { renders } = await api.listRenders(projectId);
      setRenders(renders);
      if (render.status === "failed") {
        setRenderError(render.error ?? "render failed");
        setPlayId(null);
      } else {
        setPlayId(render.id);
      }
    } catch (e) {
      setRenderError((e as Error).message);
    } finally {
      setRenderBusy(false);
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
                    {i < current ? "Approved" : i === current ? (approved ? "Approved" : "Awaiting review") : "–"}
                  </div>
                </div>
              );
            })}
          </div>

          {loading && (
            <StatusCard
              tone="loading"
              kicker="Syncing"
              title="Loading production state"
              body="Pulling the latest brief, script, storyboard, and scores from the studio."
            />
          )}
          {error && !loading && (
            <StatusCard
              tone="error"
              kicker="Connection fault"
              title="Studio unreachable"
              body={`${error} - the latest production state could not be loaded.`}
              action={
                <button className="btn btn-ghost" onClick={refresh} disabled={busy}>
                  ↻ Retry
                </button>
              }
            />
          )}

          {!loading && !error && (
            <div className="console-body">
              {/* left rail - call sheet */}
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
                  <span className="cs-vl">{stage ?? "–"}</span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Version</span>
                  <span className="cs-vl">
                    {atStoryboardGate ? `sb v${sb?.version ?? "–"}` : `v${detail?.stage?.version ?? "–"}`}
                  </span>
                </div>
                <div className="cs-row">
                  <span className="cs-nm">Gate</span>
                  <span className="cs-vl">{atResearchGate ? "research_review" : atScriptGate ? "script_review" : atStoryboardGate ? "storyboard_review" : "none"}</span>
                </div>

                <div className="csheet-block">
                  <div className="csheet-title">
                    <span className="lbl">Recent productions</span>
                  </div>
                  {recentProjects.length === 0 ? (
                    <StatusCard
                      compact
                      tone="empty"
                      kicker="Empty slate"
                      title="No other productions"
                      body="New ideas from the studio appear here for quick switching."
                    />
                  ) : (
                    recentProjects.map((p) => (
                      <button
                        key={p.id}
                        className="cs-proj"
                        onClick={() => router.push(`/projects/${p.id}`)}
                        title={p.idea}
                      >
                        <span className="cs-pj-title">{p.title ?? p.idea}</span>
                        <span className="cs-pj-stage">{p.stage?.replace("_", " ") ?? "–"}</span>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              {/* main panel */}
              <div className="panel stage-fade">
                {atDiscovery && (
                  <DiscoveryChat
                    conversation={project?.conversation ?? []}
                    idea={project?.idea ?? ""}
                    pending={atDiscovery}
                    busy={busy}
                    onSend={sendAnswer}
                  />
                )}
                {atResearchGate && (
                  <>
                    <div className="p-eyebrow">Research · Awaiting review</div>
                    {/* The approved creative brief this research stands on  - 
                        brief cards per the prototype's briefPanel() (Stage 02). */}
                    {brief && (
                      <div className="plan-section">
                        <div className="k">CREATIVE BRIEF</div>
                        <div className="brief-grid">
                          <div className="b-card">
                            <div className="k">Topic</div>
                            <div className="v">{brief.topic}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Audience</div>
                            <div className="v">{brief.audience}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Platform</div>
                            <div className="v">{brief.platform}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Style</div>
                            <div className="v">{brief.style}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Duration</div>
                            {/* HH:MM:SS - matches the approved prototype's briefPanel() */}
                            <div className="v">{formatDuration(brief.durationSeconds)}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Tone</div>
                            <div className="v">{brief.tone}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Narration</div>
                            <div className="v">{brief.narration}</div>
                          </div>
                          <div className="b-card">
                            <div className="k">Aspect ratio</div>
                            <div className="v">{brief.aspectRatio}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {research ? (
                      <div className="plan-section">
                        <div className="k">TIMELINE</div>
                        {research.timeline.map((t, i) => (
                          <div className="plan-row" key={i}>
                            <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                            <span className="nm">{t}</span>
                          </div>
                        ))}
                        <div className="k" style={{ marginTop: 16 }}>CONCEPTS</div>
                        <div className="v">{research.concepts.join(" · ") || "–"}</div>
                        <div className="k" style={{ marginTop: 16 }}>TERMINOLOGY</div>
                        {Object.entries(research.terminology ?? {}).length ? (
                          Object.entries(research.terminology).map(([term, def]) => (
                            <div className="plan-row" key={term}>
                              <span className="idx">{term}</span>
                              <span className="nm">{def}</span>
                            </div>
                          ))
                        ) : (
                          <div className="v"> - </div>
                        )}
                        <div className="k" style={{ marginTop: 16 }}>REFERENCES</div>
                        <div className="v">{research.references.join(" · ") || "–"}</div>
                        <div className="k" style={{ marginTop: 16 }}>KEY EVENTS</div>
                        {research.keyEvents.map((e, i) => (
                          <div className="plan-row" key={i}>
                            <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                            <span className="nm">{e}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="lead" style={{ color: "#7a7265" }}>
                        The research packet is being assembled - review it, then approve or ask for a retake.
                      </p>
                    )}
                  </>
                )}

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
                      <p className="lead" style={{ color: "#7a7265" }}>The script is written and scored - review it, then approve or ask for a retake.</p>
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
                          {sb.scenes.map((sc, i) => {
                            // Visual storyboard frame: a READY image asset with a
                            // real http(s) URL renders as the generated frame;
                            // otherwise the placeholder treatment shows.
                            const img = assetsByScene[sc.id]?.find((a) => a.kind === "image" && a.status === "ready");
                            const frameUrl = img?.url && /^https?:\/\//.test(img.url) ? img.url : null;
                            return (
                            <div key={sc.id} className="scene-block">
                              <SceneFrame
                                order={sc.order}
                                durationSeconds={sc.content.durationSeconds}
                                title={sc.content.title}
                                cameraDirection={sc.content.cameraDirection}
                                assetUrl={frameUrl}
                                approved={done}
                              />
                              <div className="scene-main">
                              <SceneCard
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
                              {/* Phase 3 Block 2 - per-scene asset generation: one
                                  button per kind, score once ready (low < 3 flags
                                  regeneration), FAILED becomes a retry with the
                                  error as its title. Disabled without a prompt
                                  pack (the API 409s) and at the locked plan. */}
                              <div className="scene-assets" data-testid={`scene-assets-${sc.order}`}>
                                <span className="sa-lbl">Assets</span>
                                {ASSET_KINDS.map((k) => {
                                  const ready = assetsByScene[sc.id]?.find((x) => x.kind === k && x.status === "ready");
                                  const failed = assetsByScene[sc.id]?.find((x) => x.kind === k && x.status === "failed");
                                  const q = ready ? assetQuality(ready) : null;
                                  const cls = ["mini-btn"];
                                  if (failed) cls.push("fail");
                                  else if (q && q.score < 3) cls.push("low");
                                  return (
                                    <button
                                      key={k}
                                      className={cls.join(" ")}
                                      disabled={busy || !sc.promptPack || done}
                                      onClick={() => generateAsset(sc.id, k)}
                                      aria-label={`Generate ${k} for scene ${sc.order}`}
                                      title={failed ? (failed.error ?? "generation failed - retry") : q ? q.notes.join(" · ") : undefined}
                                    >
                                      {ASSET_KIND_LABEL[k]}
                                      {q && ` · ${q.score}/5`}
                                    </button>
                                  );
                                })}
                              </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>

                        {/* prompt packs behind the advanced toggle */}
                        <button
                          className="mini-btn adv-toggle"
                          aria-expanded={showPacks}
                          onClick={() => setShowPacks((v) => !v)}
                        >
                          {showPacks ? "▾ Advanced - hide prompt packs" : "▸ Advanced - prompt packs"}
                        </button>
                        {showPacks && (
                          <div className="plan-section">
                            {sb.scenes.map((sc, i) => (
                              <div className="crew-card" key={sc.id} style={{ marginBottom: 10 }}>
                                <div className="k" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span>SC {String(sc.order).padStart(2, "0")} · {sc.content.title}</span>
                                  <span style={{ display: "flex", gap: 8 }}>
                                    {sc.promptPack && (
                                      <button
                                        className="mini-btn"
                                        disabled={busy}
                                        onClick={() => startPackEdit(sc.id, sc.promptPack!)}
                                        aria-label={`Edit pack for scene ${sc.order}`}
                                      >
                                        {editingPackId === sc.id ? "Editing…" : "Edit pack"}
                                      </button>
                                    )}
                                    <button
                                      className="mini-btn"
                                      disabled={busy}
                                      onClick={() => regeneratePack(sc.id)}
                                      aria-label={`Regenerate prompts for scene ${sc.order}`}
                                    >
                                      {busy ? "Working…" : "Regenerate pack"}
                                    </button>
                                  </span>
                                </div>
                                {editingPackId === sc.id && packDraft ? (
                                  <div className="v">
                                    {PACK_TABS.map((t) => (
                                      <div key={t.key} style={{ marginBottom: 8 }}>
                                        <b style={{ color: "var(--paper)" }}>{t.label}</b>
                                        <textarea
                                          className="pack-input"
                                          aria-label={`${t.label} prompt`}
                                          rows={2}
                                          value={packDraft[t.key]}
                                          onChange={(e) => setPackDraft((d) => (d ? { ...d, [t.key]: e.target.value } : d))}
                                        />
                                      </div>
                                    ))}
                                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                      <button
                                        className="mini-btn solid"
                                        disabled={busy}
                                        onClick={() => savePack(sc.id)}
                                        aria-label={`Save pack for scene ${sc.order}`}
                                      >
                                        {busy ? "Saving…" : "Save pack"}
                                      </button>
                                      <button
                                        className="mini-btn"
                                        disabled={busy}
                                        onClick={() => { setEditingPackId(null); setPackDraft(null); }}
                                        aria-label={`Cancel pack edit for scene ${sc.order}`}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : sc.promptPack ? (
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
                              <div className="plan-row plan-row--scene" key={sc.id}>
                                <span className="idx">SC {String(i + 1).padStart(2, "0")}</span>
                                <span className="nm">{sc.content.title}</span>
                                <span className="ds">{sc.content.transition} · {sc.content.musicCue}</span>
                                <span className="narr">{sc.content.narration}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {done && (
                          <div className="plan-section">
                            <h3>Crew sheet - consistency</h3>
                            <div className="crew-grid">
                              <div>
                                <div className="k">CAST</div>
                                {project?.characters?.length ? (
                                  project.characters.map((c) => (
                                    <div className="crew-row" key={c.id}>
                                      <b style={{ color: "var(--paper)" }}>{c.name}</b>
                                      <span style={{ color: "var(--ash)", fontSize: 12 }}>{c.description}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="v">No characters extracted.</div>
                                )}
                              </div>
                              <div>
                                <div className="k">LOCATIONS</div>
                                {project?.locations?.length ? (
                                  project.locations.map((l) => (
                                    <div className="crew-row" key={l.id}>
                                      <b style={{ color: "var(--paper)" }}>{l.name}</b>
                                      <span style={{ color: "var(--ash)", fontSize: 12 }}>{l.description}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="v">No locations extracted.</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Phase 3 Block 4 - the film: render the locked plan and
                            play the cuts. The render POST is synchronous in the
                            MVP; failures (ffmpeg missing, non-zero exit) persist
                            a failed row surfaced here with the reason. */}
                        {done && (
                          <div className="plan-section film-section">
                            <div className="k film-head">
                              <span>THE FILM</span>
                              <span className="film-cta">
                                <span className="film-hint">Locked plan · render to a cut</span>
                                <button className="btn btn-rec film-btn" onClick={doRender} disabled={busy || renderBusy}>
                                  {renderBusy ? (
                                    <>
                                      <i className="rec-dot"></i> Rendering…
                                    </>
                                  ) : (
                                    "Export film →"
                                  )}
                                </button>
                              </span>
                            </div>

                            {/* The finished-cut preview: the demo film's
                                three-shot montage (hero clip + runner stills)
                                stands in until a real render of THIS plan is
                                exported (renders need FFmpeg). Hidden once a
                                ready cut exists - that cut is the film. */}
                            {!renders.some((r) => r.status === "ready") && (
                              <div className="film-preview">
                                <div className="film-preview-head">
                                  <span className="k">The cut · preview</span>
                                  <span className="chip ok">demo footage</span>
                                </div>
                                <div className="film-preview-screen">
                                  <FilmMontage />
                                </div>
                                <div className="film-preview-cap">
                                  <span>{initialIdea ?? project?.idea ?? "Untitled idea"} · the cut</span>
                                  <span>1080p · 24fps · demo</span>
                                </div>
                              </div>
                            )}

                            {renderError && (
                              <p className="film-error">
                                Render failed: {renderError}
                              </p>
                            )}

                            {renders.length === 0 ? (
                              <p className="v" style={{ color: "var(--ash)", fontSize: 12, marginTop: 10 }}>
                                No cuts yet - export your first film from the locked plan.
                              </p>
                            ) : (
                              <div className="film-takes">
                                {renders.map((r, i) => {
                                  const n = renders.length - i;
                                  return (
                                    <div key={r.id} className={`film-take${playId === r.id ? " open" : ""}`}>
                                      <div className="film-poster">
                                        {r.thumbnailUrl ? (
                                          <img
                                            src={`${API_URL}${r.thumbnailUrl}`}
                                            alt={`Cut ${n} thumbnail`}
                                            loading="lazy"
                                          />
                                        ) : (
                                          <span className="film-poster-tc">CUT {String(n).padStart(2, "0")}</span>
                                        )}
                                        <span className={`chip ${r.status === "ready" ? "ok" : r.status === "failed" ? "fail" : "live"}`}>
                                          {r.status}
                                        </span>
                                      </div>
                                      <div className="film-meta">
                                        <div className="film-title">
                                          Cut {n}
                                          {n === 1 && <span className="chip live" style={{ marginLeft: 8 }}>latest</span>}
                                        </div>
                                        <div className="film-sub">
                                          {r.meta?.scenes != null ? `${r.meta.scenes} scenes` : "–"}
                                          {r.meta?.segments != null ? ` · ${r.meta.segments} segments` : ""}
                                          {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString()}` : ""}
                                        </div>
                                        {r.status === "failed" && r.error && (
                                          <div className="film-err">{r.error}</div>
                                        )}
                                      </div>
                                      <div className="film-actions">
                                        {r.status === "ready" && r.mp4Url && (
                                          <button
                                            className="mini-btn"
                                            onClick={() => setPlayId(playId === r.id ? null : r.id)}
                                            aria-label={`Play cut ${n}`}
                                          >
                                            {playId === r.id ? "Close" : "▶ Play"}
                                          </button>
                                        )}
                                        {r.status === "ready" && r.packageUrl && (
                                          <a className="mini-btn" href={`${API_URL}${r.packageUrl}`} aria-label={`Download cut ${n} package`}>
                                            ⬇ ZIP
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {playId && (() => {
                              const r = renders.find((x) => x.id === playId);
                              if (!r || !r.mp4Url) return null;
                              return (
                                <div className="film-player">
                                  <video
                                    controls
                                    autoPlay
                                    preload="metadata"
                                    poster={r.thumbnailUrl ? `${API_URL}${r.thumbnailUrl}` : undefined}
                                    src={`${API_URL}${r.mp4Url}`}
                                    aria-label={`Cut ${renders.length - renders.findIndex((x) => x.id === r.id)} playback`}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {!atResearchGate && !atScriptGate && !atStoryboardGate && !done && (
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
                          {scores.notes.map((n, i) => <div key={i}> -  {n}</div>)}
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
                    Script: <b style={{ color: "var(--paper)" }}>v{detail?.stage?.version ?? "–"}</b>
                    {sb && (
                      <>
                        <br />
                        Storyboard: <b style={{ color: "var(--paper)" }}>sb v{sb.version}</b>
                      </>
                    )}
                  </p>
                </div>
                {/* Consistency records - crew sheet in the coverage rail during
                storyboard review (prototype's Consistency-records card), not
                just at the locked plan. Characters/locations persist on the
                project row once the script is approved (consistency node). */}
                {atStoryboardGate && (
                  <div className="cov-card">
                    <div className="c-t">Consistency records</div>
                    <div className="cov-item">
                      <p>
                        <b>Characters:</b>{" "}
                        {project?.characters?.length
                          ? project.characters.map((c) => `${c.name} - ${c.description}`).join(" · ")
                          : "not extracted yet - locked after script approval."}
                      </p>
                    </div>
                    <div className="cov-item">
                      <p>
                        <b>Locations:</b>{" "}
                        {project?.locations?.length
                          ? project.locations.map((l) => `${l.name} - ${l.description}`).join(" · ")
                          : "not extracted yet - locked after script approval."}
                      </p>
                    </div>
                    <div className="cov-item">
                      <p>
                        <b>Editor:</b> per-scene transitions + music cues set on each scene's content.
                      </p>
                    </div>
                  </div>
                )}
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
                      {atResearchGate
                        ? "Research ready for review - approve it and the script is written, or send it back for a retake."
                        : atScriptGate
                          ? "Script ready for review - approve to lock it and storyboard, or send it back for a retake."
                          : "Scenes storyboarded - drag to reorder, then approve to lock the production plan."}
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
                      <button className="btn btn-ghost" onClick={() => doRegenerate(atResearchGate ? "research" : atScriptGate ? "script" : "storyboard")} disabled={busy}>
                        Regenerate
                      </button>
                      <button className="btn btn-rec" onClick={() => doApprove(atResearchGate ? "research" : atScriptGate ? "script" : "storyboard")} disabled={busy}>
                        {busy ? "Working…" : "Approve & continue"}
                      </button>
                    </div>
                  </>
                ) : approved ? (
                  <div className="gate-note">
                    <span className="chip ok">Approved</span>
                    Production plan locked - {sb?.scenes.length ?? 0} scenes, prompt packs set.
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
      {/* Transient action failures - the workspace stays visible; the toast
          carries its own retry and auto-dismisses. */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </main>
  );
}
