"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRODUCTION_MODES, PROJECTS, RECENT_TAKES } from "./lib/mock";

export default function StudioHome() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [mode, setMode] = useState<(typeof PRODUCTION_MODES)[number]>(PRODUCTION_MODES[0]);

  const beginProduction = () => {
    const q = idea.trim() ? `&idea=${encodeURIComponent(idea.trim())}` : "";
    const m = mode ? `&mode=${encodeURIComponent(mode)}` : "";
    router.push(`/projects/0042?stage=0${m}${q}`);
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
          <button className="btn btn-rec" onClick={beginProduction}>
            Begin production →
          </button>
        </div>
        <div className="mode-row" role="group" aria-label="Production modes">
          <span className="lbl">Mode</span>
          {PRODUCTION_MODES.map((m) => (
            <button
              key={m}
              className={`mode-chip${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <div className="section-label">Continue working</div>
      <div className="grid" id="projectGrid">
        {PROJECTS.map((p) => (
          <button
            key={p.id}
            className="slate"
            onClick={() => router.push(`/projects/${p.id}?stage=${p.stage}`)}
          >
            <span className="bracket tl"></span>
            <span className="bracket tr"></span>
            <span className="bracket bl"></span>
            <span className="bracket br"></span>
            <div className="slate-top">
              <span className="slate-code">PROJ {p.id}</span>
              <span className={`chip ${p.chipTone}`}>{p.chip}</span>
            </div>
            <div className="slate-title">{p.title}</div>
            <div className="slate-meta">{p.meta}</div>
            <div className="slate-progress">
              <i
                className={p.progress === 100 ? "full" : ""}
                style={{ width: `${p.progress}%` }}
              ></i>
            </div>
          </button>
        ))}
      </div>

      <div className="section-label">Recent takes</div>
      <div className="takes-row">
        {RECENT_TAKES.map((t) => (
          <button
            key={t.id}
            className="take-card"
            onClick={() => router.push(`/projects/${t.projectId}?stage=${t.stage}`)}
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
