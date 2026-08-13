"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ProjectRow } from "../lib/api";
import { PRODUCTION_MODES } from "../lib/mock";
import { StatusCard } from "../components/status-card";

const stageLabel = (stage: string | undefined): { chip: string; chipTone: string; progress: number } => {
  switch (stage) {
    case "done": return { chip: "Approved", chipTone: "ok", progress: 100 };
    case "script_review": return { chip: "Awaiting review", chipTone: "live", progress: 75 };
    case "brief": return { chip: "Brief ready", chipTone: "wip", progress: 50 };
    default: return { chip: "In discovery", chipTone: "wip", progress: 25 };
  }
};

// The artifact each stage is currently producing - used to label a project's
// most recent take (derived from real project data, not mock rows).
const takeArtifact = (stage: string | undefined): string => {
  switch (stage) {
    case "done": return "Production plan · locked";
    case "storyboard": return "Storyboard · in review";
    case "script_review": return "Script · in review";
    case "research": return "Research packet";
    case "brief": return "Creative brief · draft";
    default: return "Discovery · in progress";
  }
};

const timeAgo = (value: string | Date | undefined): string => {
  if (!value) return "";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "";
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function StudioHome() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [mode, setMode] = useState<string>(PRODUCTION_MODES[0]);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const ideaRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const beginProduction = async () => {
    if (!idea.trim() || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const { project } = await api.createProject(idea.trim(), mode);
      await router.push(`/projects/${project.id}`);
    } catch (e) {
      // Release the guard ONLY on failure. After a successful create the busy
      // flag stays set through navigation - a second click during a slow push
      // used to fire a duplicate create and desync the FIFO provider queue
      // (the landing/studio double-create defect). Retrying after a real
      // failure is safe: no project row was created.
      setBusy(false);
      setSubmitError((e as Error).message || "production failed to start");
    }
  };

  return (
    <main className="wrap">
      <section className="hero">
        <div className="eyebrow">AI creative studio · idea → film</div>
        <h1>What do you want to make?</h1>
        <p className="sub">
          Describe it in one line. The studio handles research, script, storyboard, and prompts.
        </p>
        <div className="idea-box">
          <input
            className="idea-input"
            type="text"
            id="ideaInput"
            value={idea}
            ref={ideaRef}
            onChange={(e) => {
              setIdea(e.target.value);
              setSubmitError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && beginProduction()}
            placeholder="“A documentary about a runner's first marathon.”"
            aria-label="Describe your video idea"
          />
          <button className="btn btn-rec" onClick={beginProduction} disabled={busy || !idea.trim()}>
            {busy ? "Starting production…" : "Begin production →"}
          </button>
        </div>
        <div className="mode-row" role="group" aria-label="Production modes">
          <span className="lbl">Mode</span>
          {PRODUCTION_MODES.map((m) => (
            <button
              key={m}
              className={`mode-chip${m === mode ? " active" : ""}`}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      {submitError && (
        <StatusCard
          tone="error"
          kicker="Roll interrupted"
          title="Production didn't start"
          body={`${submitError} - start the API with FAKE_PROVIDER=1, then retry.`}
          action={
            <>
              <button className="btn btn-rec" onClick={beginProduction} disabled={busy || !idea.trim()}>
                {busy ? "Retrying…" : "Retry"}
              </button>
              <button className="btn btn-ghost" onClick={() => setSubmitError(null)}>
                Dismiss
              </button>
            </>
          }
        />
      )}

      <div className="section-label">Continue working</div>
      {projectsLoading ? (
        /* Skeleton slate tiles mirroring the real project cards below - same
           grid, same card anatomy (code/chip, title, meta, progress), just
           shimmering bars while the studio pulls the project list. */
        <div className="grid" id="projectGrid" role="status" aria-label="Loading projects">
          <span className="sr-only">Loading projects from the studio.</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="slate slate-sk" aria-hidden="true">
              <span className="bracket tl"></span>
              <span className="bracket tr"></span>
              <span className="bracket bl"></span>
              <span className="bracket br"></span>
              <div className="slate-top">
                <span className="sk sk-code"></span>
                <span className="sk sk-chip"></span>
              </div>
              <div className="sk sk-title"></div>
              <div className="sk sk-meta"></div>
              <div className="slate-progress">
                <i className="sk-fill" style={{ width: "64%" }}></i>
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <StatusCard
          tone="error"
          kicker="Connection fault"
          title="Studio unreachable"
          body={`${loadError} - start the API with FAKE_PROVIDER=1, then retry.`}
          action={
            <button className="btn btn-ghost" onClick={refresh}>
              ↻ Retry
            </button>
          }
        />
      ) : projects.length === 0 ? (
        <StatusCard
          tone="empty"
          kicker="Empty slate"
          title="No productions yet"
          body="Describe an idea above and the studio starts its first production - brief, research, script, storyboard."
          action={
            <button
              className="btn btn-rec"
              onClick={() => {
                ideaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                ideaRef.current?.focus();
              }}
            >
              Start a production
            </button>
          }
        />
      ) : (
        <div className="grid" id="projectGrid">
          {projects.map((p) => {
            const s = stageLabel(p.stage);
            return (
              <button
                key={p.id}
                className="slate"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <span className="bracket tl"></span>
                <span className="bracket tr"></span>
                <span className="bracket bl"></span>
                <span className="bracket br"></span>
                <div className="slate-top">
                  <span className="slate-code">PROJ {p.id.slice(0, 4).toUpperCase()}</span>
                  <span className={`chip ${s.chipTone}`}>{s.chip}</span>
                </div>
                <div className="slate-title">{p.title ?? p.idea}</div>
                <div className="slate-meta">{p.idea}</div>
                <div className="slate-progress">
                  <i className={s.progress === 100 ? "full" : ""} style={{ width: `${s.progress}%` }}></i>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Recent takes are derived from the real project list - the most
          recently updated project is the most recent take. Hidden until there
          is something real to show. */}
      {projects.length > 0 && (
        <>
          <div className="section-label">Recent takes</div>
          <div className="takes-row">
            {[...projects]
              .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
              .slice(0, 4)
              .map((p) => (
                <button
                  key={p.id}
                  className="take-card"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="t-artifact">{takeArtifact(p.stage)}</div>
                  <div className="t-proj">{p.title ?? p.idea}</div>
                  <div className="t-time">{timeAgo(p.updatedAt)}</div>
                </button>
              ))}
          </div>
        </>
      )}
    </main>
  );
}
