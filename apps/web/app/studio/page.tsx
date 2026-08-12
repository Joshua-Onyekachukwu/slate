"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type ProjectRow } from "../lib/api";
import { PRODUCTION_MODES, RECENT_TAKES } from "../lib/mock";

const stageLabel = (stage: string | undefined): { chip: string; chipTone: string; progress: number } => {
  switch (stage) {
    case "done": return { chip: "Approved", chipTone: "ok", progress: 100 };
    case "script_review": return { chip: "Awaiting review", chipTone: "live", progress: 75 };
    case "brief": return { chip: "Brief ready", chipTone: "wip", progress: 50 };
    default: return { chip: "In discovery", chipTone: "wip", progress: 25 };
  }
};

export default function StudioHome() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const beginProduction = async () => {
    if (!idea.trim() || busy) return;
    setBusy(true);
    try {
      const { project } = await api.createProject(idea.trim());
      await router.push(`/projects/${project.id}`);
    } catch (e) {
      // Release the guard ONLY on failure. After a successful create the busy
      // flag stays set through navigation — a second click during a slow push
      // used to fire a duplicate create and desync the FIFO provider queue
      // (the landing/studio double-create defect). Retrying after a real
      // failure is safe: no project row was created.
      setBusy(false);
      setLoadError((e as Error).message ?? "");
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
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && beginProduction()}
            placeholder="“A documentary about the history of the universe.”"
            aria-label="Describe your video idea"
          />
          <button className="btn btn-rec" onClick={beginProduction} disabled={busy || !idea.trim()}>
            {busy ? "Starting production…" : "Begin production →"}
          </button>
        </div>
        <div className="mode-row" role="group" aria-label="Production modes">
          <span className="lbl">Mode</span>
          {PRODUCTION_MODES.map((m) => (
            <button key={m} className={`mode-chip${m === PRODUCTION_MODES[0] ? " active" : ""}`}>
              {m}
            </button>
          ))}
        </div>
      </section>

      {loadError && <p className="api-note">API unreachable ({loadError}) — start it with FAKE_PROVIDER=1.</p>}

      <div className="section-label">Continue working</div>
      <div className="grid" id="projectGrid">
        {projects.length === 0 && !loadError ? (
          <p className="empty-note">No projects yet — describe an idea above to start one.</p>
        ) : (
          projects.map((p) => {
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
          })
        )}
      </div>

      <div className="section-label">Recent takes</div>
      <div className="takes-row">
        {RECENT_TAKES.map((t) => (
          <button
            key={t.id}
            className="take-card"
            onClick={() => router.push(`/projects/${t.projectId}`)}
          >
            <div className="t-artifact">{t.artifact}</div>
            <div className="t-proj">{t.projectTitle}</div>
            <div className="t-time">{t.time}</div>
          </button>
        ))}
      </div>
    </main>
  );
}
