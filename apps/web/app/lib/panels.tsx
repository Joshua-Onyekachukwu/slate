"use client";

import Link from "next/link";
import { PromptsPanel } from "../components/prompts-panel";
import { ProductionPlan } from "../components/production-plan";
import { SceneCard } from "../components/scene-card";
import { SceneEditor } from "../components/scene-editor";
import { ScriptEditor } from "../components/script-editor";
import { STAGES, type DemoState, type Scene } from "./mock";

export function StagePanel({
  stage,
  scenes,
  onReorder,
  onSaveScene,
  showToast,
  activePara,
  onActivePara,
}: {
  stage: number;
  scenes: Scene[];
  onReorder: (from: number, to: number) => void;
  onSaveScene: (sceneId: number, patch: { title?: string; content?: Partial<Scene> }) => void;
  showToast: (msg: string) => void;
  activePara: string;
  onActivePara: (id: string) => void;
}) {
  return (
    <div className="stage-fade" key={stage}>
      {stage === 0 && <PanelIdea />}
      {stage === 1 && <PanelBrief />}
      {stage === 2 && <PanelResearch />}
      {stage === 3 && <PanelScript activePara={activePara} onActivePara={onActivePara} showToast={showToast} />}
      {stage === 4 && (
        <PanelStoryboard scenes={scenes} onReorder={onReorder} />
      )}
      {stage === 5 && (
        <PanelProduction scenes={scenes} onSaveScene={onSaveScene} showToast={showToast} />
      )}
    </div>
  );
}

export function StatePanel({
  stage,
  demoState,
  showToast,
}: {
  stage: number;
  demoState: DemoState;
  showToast: (msg: string) => void;
}) {
  const name = STAGES[stage]?.name ?? "Stage";
  if (demoState === "loading") {
    return (
      <div className="stage-fade">
        <div className="p-eyebrow">
          Stage {String(stage + 1).padStart(2, "0")} · {name} <span className="stamp">generating</span>
        </div>
        <h2>{name} is being written…</h2>
        <div className="p-meta">agent running · tokens streaming to cache</div>
        <div className="skeleton">
          <div className="sk l1"></div>
          <div className="sk l2"></div>
          <div className="sk l3"></div>
          <div className="sk l2"></div>
        </div>
      </div>
    );
  }
  if (demoState === "streaming") {
    return (
      <div className="stage-fade">
        <div className="p-eyebrow">
          Stage {String(stage + 1).padStart(2, "0")} · {name} <span className="stamp">streaming</span>
        </div>
        <h2>{name}</h2>
        <div className="p-meta">
          agent writing<span className="caret"></span>
        </div>
        <p className="lead" style={{ marginTop: 16 }}>
          The studio is drafting the first pass — the opening lands on the wonder of the first
          three minutes<span className="caret"></span>
        </p>
      </div>
    );
  }
  if (demoState === "retake") {
    return (
      <div className="stage-fade">
        <div className="p-eyebrow">
          Stage {String(stage + 1).padStart(2, "0")} · {name} <span className="stamp">failed</span>
        </div>
        <h2>{name} needs a retake</h2>
        <div className="p-meta">provider 429 · retrying with backoff</div>
        <p className="lead" style={{ marginTop: 16 }}>
          The studio hit a rate limit while generating. Nothing is lost — the partial draft is
          saved and we will resume automatically.
        </p>
        <div className="retake">
          RETAKE — rate limit hit (429) on provider call, retrying in 30s
          <button className="mini-btn solid" onClick={() => showToast("Retrying now…")}>
            Retry now
          </button>
        </div>
      </div>
    );
  }
  // empty
  return (
    <div className="stage-fade">
      <div className="p-eyebrow">No projects yet</div>
      <h2>Start with an idea</h2>
      <p className="lead" style={{ marginTop: 12 }}>
        Type a one-line idea on the dashboard and the studio handles the rest — research, script,
        storyboard, prompts.
      </p>
      <div style={{ marginTop: 20 }}>
        <Link className="mini-btn dark" href="/studio">
          ← Back to idea input
        </Link>
      </div>
    </div>
  );
}

/* ================= STAGE PANELS ================= */

function PanelIdea() {
  return (
    <>
      <div className="p-eyebrow">Stage 01 · Creative discovery</div>
      <h2>Turning your idea into a brief</h2>
      <div className="p-meta">conversation v1 · answered 21:31</div>
      <div className="chat">
        <div className="msg user">
          <div className="who">You</div>
          <div className="bubble">A documentary about the history of the universe.</div>
        </div>
        <div className="msg">
          <div className="who">Studio</div>
          <div className="bubble">
            Love it. A few questions before I draft the brief:
            <ul>
              <li>Who is this for — general audience, students, or enthusiasts?</li>
              <li>Where will it live — YouTube, a course, social?</li>
              <li>How long — under 3 minutes, 4–5, or longer?</li>
              <li>Any visual style you lean toward — archival, cinematic, animated diagrams?</li>
            </ul>
          </div>
        </div>
        <div className="msg user">
          <div className="who">You</div>
          <div className="bubble">General audience on YouTube. 4–5 minutes. Cinematic, with a little wonder.</div>
        </div>
        <div className="msg">
          <div className="who">Studio</div>
          <div className="bubble">That gives me everything — drafting the brief now.</div>
        </div>
      </div>
    </>
  );
}

function PanelBrief() {
  return (
    <>
      <div className="p-eyebrow">
        Stage 02 · Creative brief <span className="stamp">approved 21:34</span>
      </div>
      <h2>The History of the Universe</h2>
      <div className="p-meta">v2 · generated 21:33 · 3.1k tokens · tap any value to edit</div>
      <div className="brief-grid">
        <BriefCard k="Topic" v="The history of the universe" />
        <BriefCard k="Audience" v="General, curious newcomers" />
        <BriefCard k="Platform" v="YouTube" />
        <BriefCard k="Style" v="Cinematic documentary" />
        <BriefCard k="Duration" v="00:04:30" tag="≈ 650 words" />
        <BriefCard k="Tone" v="Wonder-driven, calm" />
        <BriefCard k="Narration" v="Female, warm documentary" />
        <BriefCard k="Aspect ratio" v="16:9" />
      </div>
    </>
  );
}

function BriefCard({ k, v, tag }: { k: string; v: string; tag?: string }) {
  return (
    <div className="b-card">
      <div className="k">{k}</div>
      <div className="v" contentEditable suppressContentEditableWarning>
        {v}
      </div>
      {tag && <div className="tag">{tag}</div>}
    </div>
  );
}

function PanelResearch() {
  return (
    <>
      <div className="p-eyebrow">
        Stage 03 · Research packet <span className="stamp">approved 21:40</span>
      </div>
      <h2>Grounding the timeline</h2>
      <div className="p-meta">v3 · generated 21:39 · 14.2k tokens · 6 sources</div>
      <p className="lead" style={{ marginTop: 16 }}>
        The factual spine your script stands on. Drawn from the approved brief:{" "}
        <em>documentary, general audience, 4:30, wonder-driven.</em>
      </p>
      <h3>Timeline</h3>
      <ul className="tl">
        <li><span className="t">13.8 bya</span>Big Bang — space and time begin</li>
        <li><span className="t">13.5 bya</span>First stars ignite in dark hydrogen</li>
        <li><span className="t">13.1 bya</span>Galaxies assemble; the Milky Way forms</li>
        <li><span className="t">4.6 bya</span>Our solar system condenses from a dust disk</li>
        <li><span className="t">3.8 bya</span>Life appears on Earth</li>
        <li><span className="t">300 kya</span>Homo sapiens — the universe looks back at itself</li>
      </ul>
      <h3>Key concepts</h3>
      <div className="chip-row">
        <span className="score-chip">Cosmic inflation</span>
        <span className="score-chip">Dark matter</span>
        <span className="score-chip">Dark energy</span>
        <span className="score-chip">CMB radiation</span>
        <span className="score-chip">Redshift</span>
        <span className="score-chip">Observable universe</span>
      </div>
      <h3>Terminology</h3>
      <table className="term-table">
        <tbody>
          <tr><td>redshift</td><td>light stretched by expanding space — a cosmic yardstick</td></tr>
          <tr><td>CMB</td><td>the afterglow of the Big Bang, detected 1965</td></tr>
          <tr><td>inflation</td><td>the universe's brief, violent expansion in its first instant</td></tr>
        </tbody>
      </table>
      <h3>References</h3>
      <p>
        NASA WMAP/Planck data · "A Brief History of Time" (Hawking) · PBS Space Time. Claims
        without a source are marked <em>unverified</em> and cap the script's factual score.
      </p>
    </>
  );
}

function PanelScript({
  activePara,
  onActivePara,
  showToast,
}: {
  activePara: string;
  onActivePara: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  return (
    <>
      <div className="p-eyebrow">
        Stage 04 · Script <span className="stamp">approved 21:47</span>
      </div>
      <h2>The First Three Minutes</h2>
      <div className="p-meta">v3 · revised after review · 00:04:12 read · editor: TipTap</div>
      <ScriptEditor activePara={activePara} onActivePara={onActivePara} showToast={showToast} />
    </>
  );
}

function PanelStoryboard({
  scenes,
  onReorder,
}: {
  scenes: Scene[];
  onReorder: (from: number, to: number) => void;
}) {
  return (
    <>
      <div className="p-eyebrow">
        Stage 05 · Storyboard <span className="stamp">approved 21:52</span>
      </div>
      <h2>Six scenes, one throughline</h2>
      <div className="p-meta">v2 · 6 scenes · 00:04:30 · drag to reorder</div>
      <div className="scene-list" id="sceneList">
        {scenes.map((s, i) => (
          <SceneCard
            key={s.id}
            order={i + 1}
            index={i}
            durationSeconds={s.durationSeconds}
            transition={s.transition}
            status={s.status}
            tone={s.tone}
            meta={s.meta}
            onReorder={onReorder}
            content={{
              title: s.title,
              narration: s.narration,
              visualDescription: s.visual,
              cameraDirection: s.camera,
              durationSeconds: s.durationSeconds,
              transition: s.transition,
              musicCue: s.musicCue,
            }}
            editing={false}
            onEdit={() => {}}
            onSave={() => {}}
            onCancel={() => {}}
          />
        ))}
      </div>
    </>
  );
}

function PanelProduction({
  scenes,
  onSaveScene,
  showToast,
}: {
  scenes: Scene[];
  onSaveScene: (sceneId: number, patch: { title?: string; content?: Partial<Scene> }) => void;
  showToast: (msg: string) => void;
}) {
  const scene = scenes[2] ?? scenes[0];
  return (
    <>
      <div className="p-eyebrow">
        Stage 06 · Production <span className="stamp">awaiting review</span>
      </div>
      <h2>Finalize the plan</h2>
      <div className="p-meta">scenes · prompt packs · crew sheet · approve to export</div>

      <div className="plan-section">
        <h3>Scene editor</h3>
        <SceneEditor
          key={scene.id}
          scene={scene}
          onSave={(patch) => onSaveScene(scene.id, patch)}
          showToast={showToast}
        />
      </div>

      <div className="plan-section">
        <h3>Prompt packs</h3>
        <PromptsPanel scenes={scenes} showToast={showToast} />
      </div>

      <ProductionPlan scenes={scenes} embedded />
    </>
  );
}
