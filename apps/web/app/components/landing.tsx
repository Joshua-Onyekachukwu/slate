"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import { StatusCard } from "./status-card";

// The public face of Slate (the Cutting Room) - a marketing landing page in the
// approved token language (ink/tungsten/REC, 2px radius, brackets, timecode).
// The film it showcases is a human story: "A documentary about a runner's first
// marathon." Real stills from that film run through the hero storyboard, the
// pipeline board, and the cutting-room suite, and the hero plays the film's
// opening scene as a real looping clip (muted, autoplay). The imagery is
// sourced from Pexels under its free license (stored in /public/frames): a
// runner smiling in the morning light, two runners sharing a laugh, arms up at
// the finish line - people, motion, and joy, not empty-sky montage.
//
// Auth routing (env-gated like everything else, ADR-022/023): when Clerk keys
// are present the primary CTAs send anonymous visitors to /sign-up; in local
// demo mode (no keys) they go straight to /studio. The middleware protects
// /studio + /projects, so an anonymous real-Clerk visitor hitting /studio gets
// the 307 -> /sign-in contract instead.
//
// The five phases still read like a shoot schedule - each is a DAY on the call
// sheet. DAY 05 is the Phase 3 tail.

// The storyboard - three shots from the film with real slate metadata. Read as
// a contact sheet: timecode, shot size + move, and the beat the shot carries.
const FRAMES = [
  {
    tc: "SC 01 · 00:00:00:00",
    cap: "Cold open",
    src: "/frames/cold-open.jpg",
    rec: true,
    shot: "EXT · WIDE · PUSH-IN · 12s",
    beat: "First steps into an empty street, morning light on her face. She smiles before the gun.",
  },
  {
    tc: "SC 02 · 00:00:14:00",
    cap: "The moment",
    src: "/frames/the-flash.jpg",
    rec: false,
    shot: "EXT · MED · OTS · 10s",
    beat: "Two runners share a laugh at the turnaround. The race's quiet best part.",
  },
  {
    tc: "SC 03 · 00:00:28:00",
    cap: "The finish",
    src: "/frames/first-light.jpg",
    rec: false,
    shot: "EXT · WIDE · CRANE-DOWN · 14s",
    beat: "Arms up at the line. The crowd answers.",
  },
];

// The pipeline - five days on the call sheet. Each row pairs a short beat with
// a still from the film on the production board beside it.
const PHASES = [
  {
    n: "01",
    name: "Conceive",
    day: "Day 01",
    call: "09:00 call",
    dept: "Planning",
    what: "Your one-line idea is interrogated into a creative brief: audience, platform, style, tone, duration, aspect ratio.",
    tags: ["Creative brief", "Audience", "Style", "Tone"],
    frame: "/frames/cold-open.jpg",
    tc: "00:00:00:00",
    kind: "still",
    future: false,
  },
  {
    n: "02",
    name: "Research",
    day: "Day 02",
    call: "09:00 call",
    dept: "Facts",
    what: "A factual packet is assembled: timeline, concepts, terminology, references, key events.",
    tags: ["Timeline", "Concepts", "References", "Key events"],
    frame: "/frames/the-flash.jpg",
    tc: "00:00:14:00",
    kind: "still",
    future: false,
  },
  {
    n: "03",
    name: "Write",
    day: "Day 03",
    call: "09:00 call",
    dept: "Writing",
    what: "The script agent drafts hook, body, and close. The reviewer scores clarity, pacing, engagement, retention.",
    tags: ["Title", "Hook", "Body", "Conclusion"],
    frame: "/frames/first-light.jpg",
    tc: "00:00:28:00",
    kind: "still",
    future: false,
  },
  {
    n: "04",
    name: "Plan",
    day: "Day 04",
    call: "09:00 call",
    dept: "Storyboard",
    what: "Scenes become slate lines: narration, visuals, camera, duration, transitions. Cast and locations lock for consistency.",
    tags: ["Scenes", "Prompt packs", "Cast", "Locations"],
    frame: "/frames/first-light.jpg",
    tc: "00:00:28:00",
    kind: "still",
    future: false,
  },
  {
    n: "05",
    name: "Produce",
    day: "Day 05",
    call: "09:00 call",
    dept: "Post",
    what: "Assets generate per scene: image, video, voice, music. Then the film renders and exports.",
    tags: ["Image", "Video", "Voice", "Music", "Render"],
    frame: "/frames/cold-open.jpg",
    tc: "00:00:00:00",
    kind: "video",
    future: true,
  },
];

// ---------- hero: the film, playing ----------

function HeroVideo() {
  return (
    <div className="land-theater" aria-label="Preview of the demo film, playing">
      <div className="land-strip-holes top"></div>
      <div className="land-theater-screen">
        <video
          src="/frames/cold-open.mp4"
          poster="/frames/cold-open.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label="Cold open of the demo film: a runner on an empty city street at dawn"
        />
        <span className="land-theater-tc">
          <i className="rec-dot"></i> REC · 00:00:00:12
        </span>
        <span className="land-theater-slate">
          SC 01 · EXT · WIDE · PUSH-IN
        </span>
      </div>
      <div className="land-theater-bar">
        <span className="land-theater-title">Cold open · the start</span>
        <span className="land-theater-meta">PROD 0042 · day 1 rushes</span>
        <span className="land-theater-play">▶ playing</span>
      </div>
      <div className="land-strip-holes bottom"></div>
    </div>
  );
}

// ---------- hero storyboard strip (real stills, slate metadata) ----------

function HeroStrip() {
  return (
    <div className="land-strip" aria-label="Storyboard contact sheet">
      <div className="land-strip-head">
        <span className="land-strip-code">SB V3 · CONTACT SHEET · 3 SHOTS</span>
        <span className="chip live">in review</span>
      </div>
      <div className="land-strip-frames">
        {FRAMES.map((f) => (
          <figure key={f.tc} className={`land-frame${f.rec ? " rec" : ""}`}>
            <div className="land-frame-img">
              <img src={f.src} alt={`Storyboard: ${f.cap}`} loading="lazy" />
            </div>
            <figcaption className="land-frame-cap">
              <span className="land-frame-tc">{f.tc}</span>
              {f.rec && <span className="rec-dot"></span>}
              <span className="land-frame-cap-name">{f.cap}</span>
              <span className="land-frame-shot">{f.shot}</span>
              <span className="land-frame-beat">{f.beat}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------- the main page ----------

export function Landing({ authEnabled }: { authEnabled: boolean }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Landing CTAs: auth configured -> /sign-up (real accounts); local demo ->
  // create the project HERE and navigate straight to its workspace. The
  // middleware handles the enforced-mode redirect contract for any anonymous
  // hit on /studio.
  const enter = () => router.push(authEnabled ? "/sign-up" : "/studio");
  const begin = async () => {
    if (!idea.trim() || busy) return;
    if (authEnabled) {
      router.push(`/sign-up?redirect_url=/studio`);
      return;
    }
    // Demo mode: create + navigate in ONE step. Routing to /studio instead
    // dropped the typed idea and invited a second create that double-consumed
    // the FIFO provider queue (the landing/studio double-create defect). The
    // busy flag stays set through navigation so a slow push can't double-fire.
    setBusy(true);
    try {
      const { project } = await api.createProject(idea.trim());
      await router.push(`/projects/${project.id}`);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message ?? "Could not start production.");
    }
  };

  return (
    <main className="landing">
      {/* ============ HERO ============ */}
      <section className="land-hero">
        <div className="land-eyebrow">
          <span className="rec-dot"></span> The cutting room · AI creative studio
        </div>
        <h1>
          Type an idea.
          <br />
          Approve every take.
          <br />
          <em>Ship the film.</em>
        </h1>
        <p className="land-sub">
          A crew of production agents takes your one-line idea from research to
          script to storyboard, with your approval at every gate.{" "}
          <em>No prompt engineering. No blank canvas.</em>
        </p>

        <div className="land-prompt">
          <span className="land-tc">IN&nbsp;&nbsp;01:00:00:00</span>
          <input
            className="idea-input"
            type="text"
            id="landingIdeaInput"
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && begin()}
            placeholder="“A documentary about a runner's first marathon.”"
            aria-label="Type your video idea"
          />
          <button className="btn btn-rec" onClick={begin} disabled={!idea.trim() || busy}>
            {busy ? "Starting production…" : "Begin production →"}
          </button>
        </div>
        <button className="land-skip" onClick={enter}>
          or open the studio without an idea →
        </button>
        {error && (
          <StatusCard
            tone="error"
            kicker="Connection fault"
            title="Production didn't start"
            body={`${error} - is the API running? Start it with FAKE_PROVIDER=1, then retry.`}
            action={
              <button className="btn btn-rec" onClick={begin} disabled={busy}>
                {busy ? "Retrying…" : "↻ Retry"}
              </button>
            }
          />
        )}

        <div className="land-trust">
          <span className="land-trust-lbl">Model-agnostic pipeline</span>
          <span className="land-trust-item">NVIDIA Build</span>
          <span className="land-trust-sep"></span>
          <span className="land-trust-item">OpenAI</span>
          <span className="land-trust-sep"></span>
          <span className="land-trust-item">Anthropic</span>
          <span className="land-trust-sep"></span>
          <span className="land-trust-item">FFmpeg</span>
        </div>

        <HeroVideo />

        <HeroStrip />
      </section>

      {/* ============ 5-PHASE PIPELINE ============ */}
      <section className="land-section land-pipeline" id="pipeline">
        <div className="land-kicker">The production pipeline</div>
        <h2>From pitch to picture-lock, in five moves.</h2>
        <p className="land-lead">
          One workflow, five phases. Each one reviewable and editable. The
          studio never runs ahead of your approval.
        </p>

        <div className="land-pipe">
          <ol className="land-pipe-list" role="list" aria-label="Production phases">
            {PHASES.map((p) => (
              <li key={p.n} className={`land-pipe-item${p.future ? " future" : ""}`} role="listitem">
                <span className="land-pipe-n">{p.n}</span>
                <div className="land-pipe-body">
                  <div className="land-pipe-top">
                    <span className="land-pipe-name">{p.name}</span>
                    <span className="land-pipe-day">
                      {p.day} · {p.call} · dept: {p.dept}
                    </span>
                  </div>
                  <p className="land-pipe-what">{p.what}</p>
                  <div className="land-pipe-tags">
                    {p.tags.map((t) => (
                      <span key={t} className="land-day-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`land-pipe-state${p.future ? " future" : ""}`}>
                  {p.future ? "Phase 3" : "Approved"}
                </span>
              </li>
            ))}
          </ol>

          {/* the production board - the film's contact sheet, day by day */}
          <div className="land-pipe-board" aria-hidden="true">
            <div className="board-bar">
              <span className="board-title">PROD 0042 · CONTACT SHEET</span>
              <span className="chip live">SB V3 · in review</span>
            </div>
            <div className="board-stats">
              <span>3 SHOTS</span>
              <span>00:00:36 RUNTIME</span>
              <span>16 ASSETS</span>
              <span>4 GATES</span>
            </div>
            <div className="board-body">
              {PHASES.map((p, i) => (
                <div key={p.n} className={`board-row${p.future ? " future" : ""}`}>
                  <div className="board-spine">
                    <i className={p.future ? "dot future" : "dot ok"}></i>
                    {i < PHASES.length - 1 && <i className="spine-line"></i>}
                  </div>
                  <div className="board-thumb">
                    <img src={p.frame} alt="" loading="lazy" />
                    {p.kind === "video" && <span className="board-play">▶</span>}
                  </div>
                  <div className="board-meta">
                    <span className="board-tc">{p.tc}</span>
                    <b>
                      {p.n} · {p.name}
                    </b>
                    <span className="board-day">
                      {p.day} · {p.dept}
                    </span>
                  </div>
                  <span className={`board-stamp${p.future ? " future" : " ok"}`}>
                    {p.future ? "REC" : "✓"}
                  </span>
                </div>
              ))}
            </div>
            <div className="board-end">
              <span className="board-end-mark">
                <b>PICTURE LOCK</b> · TC 01:00:00:00
              </span>
              <span className="board-end-mark">3 SHOTS · 1 CUT</span>
            </div>
          </div>
        </div>
        <p className="land-note">
          Days 01–04 ship in this build. Asset generation, render, and export arrive with Phase 3.
        </p>
      </section>

      {/* ============ THE CUTTING ROOM ============ */}
      <section className="land-section land-suite-sec" id="cutting-room">
        <div className="land-kicker">The cutting room</div>
        <h2>The studio, not the settings.</h2>
        <p className="land-lead">
          No timeline, no node graph, no prompt-box mountain. Your project reads
          like a real production: script on paper, scenes as slate lines, scores
          and consistency records in the coverage rail. This is the bay where
          the film gets cut, reviewed, and stamped.
        </p>

        <div className="land-suite" aria-hidden="true">
          <img className="suite-bg" src="/frames/studio-edit.jpg" alt="" loading="lazy" />
          <div className="suite-shade"></div>

          {/* the monitor: a still from the film + a live timeline */}
          <div className="suite-monitor">
            <div className="suite-monitor-bar">
              <span className="suite-monitor-tc">EDIT BAY 03</span>
              <span className="chip rec">rec</span>
            </div>
            <div className="suite-screen">
              <img src="/frames/the-flash.jpg" alt="" />
              <span className="suite-screen-tc">
                <i className="rec-dot"></i> 00:00:14:12
              </span>
            </div>
            <div className="suite-timeline">
              <div className="suite-tl-clip" style={{ width: "33%" }}>
                <b>SC 01</b> 12s
              </div>
              <div className="suite-tl-clip live" style={{ width: "28%" }}>
                <b>SC 02</b> 10s
              </div>
              <div className="suite-tl-clip" style={{ width: "39%" }}>
                <b>SC 03</b> 14s
              </div>
              <i className="suite-playhead"></i>
            </div>
            <div className="suite-transport">
              <span className="suite-tr-btn">◀◀</span>
              <span className="suite-tr-btn">▶</span>
              <span className="suite-tr-btn">■</span>
              <span className="suite-tr-tc">00:00:14:12 / 01:00:00:00</span>
            </div>
          </div>

          {/* the console: scene coverage + scores */}
          <div className="suite-console">
            <div className="suite-console-bar">
              <span>PROD 0042 · THE CUTTING ROOM</span>
              <span className="chip rec">rec</span>
            </div>
            <div className="suite-rows">
              <div className="suite-row">
                <span className="suite-code">SC 01 · 00:00:00:00</span>
                <span className="suite-title">Cold open · the start</span>
                <span className="suite-stamp ok">✓ Approved</span>
              </div>
              <div className="suite-row live">
                <span className="suite-code">SC 02 · 00:00:14:00</span>
                <span className="suite-title">The moment · two runners</span>
                <span className="suite-stamp rec">
                  <i className="rec-dot"></i> Awaiting review
                </span>
              </div>
              <div className="suite-row">
                <span className="suite-code">SC 03 · 00:00:28:00</span>
                <span className="suite-title">The finish · arms up</span>
                <span className="suite-stamp ok">✓ Approved</span>
              </div>
            </div>
            <div className="suite-scores">
              <div className="score-line">
                <span className="nm">Clarity</span>
                <span className="val">
                  <b>4.5</b>/5
                  <span className="bar">
                    <i style={{ width: "90%" }}></i>
                  </span>
                </span>
              </div>
              <div className="score-line">
                <span className="nm">Engagement</span>
                <span className="val">
                  <b>4.2</b>/5
                  <span className="bar">
                    <i className="amber" style={{ width: "84%" }}></i>
                  </span>
                </span>
              </div>
              <div className="score-line">
                <span className="nm">Pacing</span>
                <span className="val">
                  <b>4.0</b>/5
                  <span className="bar">
                    <i className="amber" style={{ width: "80%" }}></i>
                  </span>
                </span>
              </div>
            </div>
            <div className="suite-console-foot">
              <span>SCRIPT v2 · SB v3 · coverage live</span>
              <span className="rec-dot"></span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ YOU DIRECT ============ */}
      <section className="land-section land-gates" id="gates">
        <div className="land-kicker">Human in the loop</div>
        <h2>You direct. The crew executes.</h2>
        <div className="land-gates-row">
          <div className="land-gate">
            <div className="land-gate-top">
              <span className="land-gate-code">Gate 01</span>
              <span className="chip done">Approved</span>
            </div>
            <p>
              The draft clears every review line. You stamp it, and the workflow
              advances. Script to storyboard. Storyboard to production plan.
            </p>
          </div>
          <div className="land-gate">
            <div className="land-gate-top">
              <span className="land-gate-code">Gate 02</span>
              <span className="chip fail">Retake · notes</span>
            </div>
            <p>
              A score misses the threshold, or you want a different take. Type
              your notes; the crew re-runs the stage and brings the revision
              back to the gate.
            </p>
          </div>
          <div className="land-gate">
            <div className="land-gate-top">
              <span className="land-gate-code">Gate 03</span>
              <span className="chip wip">New take</span>
            </div>
            <p>
              The take misses the mark, but the notes are clear. The crew rolls
              a fresh take from the same brief, and you compare them side by
              side.
            </p>
          </div>
          <div className="land-gate">
            <div className="land-gate-top">
              <span className="land-gate-code">Gate 04</span>
              <span className="chip ok">Locked</span>
            </div>
            <p>
              The last gate. Every scene approved, every asset signed off. From
              here the film renders and exports.
            </p>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="land-cta">
        <div className="land-cta-bg"></div>
        <div className="land-cta-shade"></div>
        <div className="land-cta-in">
          <div className="land-eyebrow">
            <span className="rec-dot"></span> First take · roll camera
          </div>
          <h2>Roll the first take.</h2>
          <p>Your idea is the only thing you need.</p>
          <button className="btn btn-rec" onClick={enter}>
            {authEnabled ? "Start a production →" : "Open the studio →"}
          </button>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="land-footer">
        <div className="land-footer-in">
          <div className="land-footer-cols">
            <div className="land-footer-brand">
              <span className="brand">
                <span className="rec-dot"></span> slate
              </span>
              <p className="land-footer-tag">
                The cutting room. A one-line idea becomes an approved,
                editable film.
              </p>
              <span className="land-footer-stack">
                NVIDIA Build · Postgres · FFmpeg · React
              </span>
            </div>

            <nav className="land-footer-col" aria-label="Product">
              <h4>Product</h4>
              <a href="/studio">Studio</a>
              <a href="/projects/0042?stage=7">Projects</a>
              <a href="#pipeline">Pipeline</a>
              <a href="#cutting-room">Cutting room</a>
            </nav>

            <nav className="land-footer-col" aria-label="The studio">
              <h4>The studio</h4>
              <a href="#pipeline">Production pipeline</a>
              <a href="#cutting-room">The cutting room</a>
              <a href="#gates">Human in the loop</a>
              <a href="#gates">Approval gates</a>
            </nav>

            <nav className="land-footer-col" aria-label="Company">
              <h4>Company</h4>
              <a href="#gates">Why Slate</a>
              <a href="#pipeline">How it works</a>
              <a href="/studio">Try the studio</a>
              <a href="#cutting-room">Contact</a>
            </nav>
          </div>

          <div className="land-footer-bottom">
            <span>© 2026 Slate · The cutting room</span>
            <span className="land-footer-tc">TC 01:00:00:00 · PICTURE LOCK</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
