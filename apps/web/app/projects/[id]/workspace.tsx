"use client";

import Link from "next/link";
import { useState } from "react";
import { CallSheet } from "../../components/call-sheet";
import { DirectorBar } from "../../components/director-bar";
import { DirectorsNotes } from "../../components/directors-notes";
import { StageStepper } from "../../components/stage-stepper";
import { Toast } from "../../components/toast";
import { DEMO_STATES, PROJECTS, SCENES, STAGES, type DemoState, type Scene } from "../../lib/mock";
import { StagePanel, StatePanel } from "../../lib/panels";

export function Workspace({
  projectId,
  initialStage,
  initialIdea,
  initialMode,
}: {
  projectId: string;
  initialStage: number;
  initialIdea: string;
  initialMode: string;
}) {
  const project = PROJECTS.find((p) => p.id === projectId);

  const [stage, setStage] = useState(initialStage);
  const [demoState, setDemoState] = useState<DemoState>("normal");
  const [scenes, setScenes] = useState<Scene[]>(SCENES);
  const [activePara, setActivePara] = useState("p1");
  const [toast, setToast] = useState<string | null>(null);
  const [toastNonce, setToastNonce] = useState(0);

  const title = initialIdea || project?.title || "Untitled idea";
  const modeSuffix = initialMode ? ` · ${initialMode}` : "";

  const showToast = (msg: string) => {
    setToast(msg);
    setToastNonce((n) => n + 1);
  };

  const jump = (i: number) => {
    setStage(i);
    setDemoState("normal");
  };

  const reorder = (from: number, to: number) => {
    setScenes((prev) => {
      if (from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    showToast("Scenes reordered");
  };

  const saveScene = (sceneId: number, patch: { title?: string; content?: Partial<Scene> }) => {
    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId ? { ...s, ...(patch.title ? { title: patch.title } : {}), ...(patch.content ?? {}) } : s
      )
    );
    showToast("Scene saved — v3");
  };

  const approveStage = () => {
    if (stage < STAGES.length - 1) {
      setStage(stage + 1);
      setDemoState("normal");
    }
    // Final (Production) stage: nothing to advance to — the DirectorBar's own
    // stamp + toast confirm the approval.
  };

  return (
    <main>
      {/* prototype controls: jump to any stage / state */}
      <div className="demo-bar">
        <span className="lbl">Prototype controls</span>
        <span className="lbl">Stage</span>
        <div className="grp">
          {STAGES.map((s, i) => (
            <button
              key={s.name}
              className={`demo-btn${i === stage ? " active" : ""}`}
              data-s={i}
              onClick={() => jump(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <span className="lbl">State</span>
        <div className="grp">
          {DEMO_STATES.map((s) => (
            <button
              key={s}
              className={`demo-btn${s === demoState ? " active" : ""}`}
              data-state={s}
              onClick={() => setDemoState(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <section className="view-ws console">
        <div className="wrap">
          <div className="ws-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Project · PROJ {project?.id ?? "NEW"}
              </div>
              <h1 className="ws-title">{title}</h1>
              <div className="ws-meta">
                {project?.meta ?? "16:9 · 00:04:30 · documentary · NVIDIA/nvidia-llama-3.3-70b"}
                {modeSuffix}
              </div>
            </div>
            <Link className="btn btn-ghost" href="/">
              ← Back to studio
            </Link>
          </div>

          {/* horizontal stepper: narrow screens only (call sheet takes over on desktop) */}
          <div className="stepper-mobile">
            <StageStepper current={stage} onJump={jump} />
          </div>

          <div className="console-body">
            {/* left rail — the call sheet */}
            <CallSheet current={stage} onJump={jump} />

            {/* center — the canvas */}
            <div className="canvas" id="mainPanel">
              {demoState === "normal" ? (
                <StagePanel
                  stage={stage}
                  scenes={scenes}
                  onReorder={reorder}
                  onSaveScene={saveScene}
                  showToast={showToast}
                  activePara={activePara}
                  onActivePara={setActivePara}
                />
              ) : (
                <StatePanel stage={stage} demoState={demoState} showToast={showToast} />
              )}
            </div>

            {/* right rail — director's notes */}
            <DirectorsNotes
              stage={stage}
              demoState={demoState}
              showToast={showToast}
              activePara={activePara}
            />
          </div>
        </div>

        {/* persistent director bar */}
        <DirectorBar
          stage={stage}
          hidden={demoState !== "normal"}
          showToast={showToast}
          onApprove={approveStage}
        />
      </section>

      <Toast message={toast} nonce={toastNonce} />
    </main>
  );
}
