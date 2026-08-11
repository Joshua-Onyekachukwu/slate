"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The public face of Slate (the Cutting Room) — a marketing landing page in the
// approved token language (ink/tungsten/REC, 2px radius, brackets, timecode).
// The "visuals" are the product itself: every graphic below is a static mock of
// the real workspace (brief cards, research timeline, script on paper, slate
// lines, coverage rail) rendered from the app's own design tokens — no stock
// imagery, no placeholder photos.
//
// Auth routing (env-gated like everything else, ADR-022/023): when Clerk keys
// are present the primary CTAs send anonymous visitors to /sign-up; in local
// demo mode (no keys) they go straight to /studio. The middleware protects
// /studio + /projects, so an anonymous real-Clerk visitor hitting /studio gets
// the 307 → /sign-in contract instead.
const PHASES = [
  {
    n: "01",
    name: "Conceive",
    tag: "One line in, a creative brief out — topic, audience, style, tone, aspect ratio.",
    future: false,
  },
  {
    n: "02",
    name: "Research",
    tag: "A factual packet — timeline, concepts, references, key events — reviewed before a word is written.",
    future: false,
  },
  {
    n: "03",
    name: "Write",
    tag: "A scored, editable script on paper. Below the line? Retake with notes until it clears.",
    future: false,
  },
  {
    n: "04",
    name: "Plan",
    tag: "Scenes as slate lines — reorder, edit, per-scene prompt packs, and a consistency crew.",
    future: false,
  },
  {
    n: "05",
    name: "Produce",
    tag: "Asset generation, render, and export — Phase 3, built against this exact scaffold.",
    future: true,
  },
];

// Contact-sheet frames in the hero — tiny geometric "stills" in the token
// palette (solid tones only, no gradients): a film strip with sprocket holes.
const FRAMES = [
  { tc: "SC 01 · 00:00:00:00", cap: "Cold open", art: "dawn", rec: true },
  { tc: "SC 02 · 00:00:14:00", cap: "The flash", art: "pan", rec: false },
  { tc: "SC 03 · 00:00:28:00", cap: "First light", art: "lens", rec: false },
  { tc: "SC 04 · 00:00:41:00", cap: "Deep field", art: "grid", rec: false },
];

// ---------- mini product visuals ----------

function MiniBrief() {
  return (
    <div className="lv lv-brief" aria-hidden="true">
      <div className="b-card">
        <span className="k">Topic</span>
        <span className="v">The universe</span>
      </div>
      <div className="b-card">
        <span className="k">Audience</span>
        <span className="v">General</span>
      </div>
      <div className="b-card">
        <span className="k">Style</span>
        <span className="v">Documentary</span>
      </div>
      <div className="b-card">
        <span className="k">Tone</span>
        <span className="v">Wonder</span>
      </div>
    </div>
  );
}

function MiniTimeline() {
  return (
    <div className="lv lv-tl" aria-hidden="true">
      <ol className="tl">
        <li>
          <span className="t">13.8 BYA</span>
          Big Bang
        </li>
        <li>
          <span className="t">4.5 BYA</span>
          Earth forms
        </li>
        <li>
          <span className="t">3.7 BYA</span>
          First life
        </li>
      </ol>
    </div>
  );
}

function MiniScript() {
  return (
    <div className="lv lv-script" aria-hidden="true">
      <div className="lv-title">The First Three Minutes</div>
      <p className="lv-para">In the beginning, there was nothing — no light, no time, no matter.</p>
      <p className="lv-para">Then, in less than a second, everything.</p>
      <div className="lv-scores">
        <span className="score-chip">
          Clarity <b>4.5</b>
        </span>
        <span className="score-chip">
          Engagement <b>4.2</b>
        </span>
      </div>
    </div>
  );
}

function MiniSlate() {
  return (
    <div className="lv lv-slate" aria-hidden="true">
      <div className="slate-line">
        <span className="sl-bracket tl"></span>
        <span className="sl-bracket tr"></span>
        <span className="sl-bracket bl"></span>
        <span className="sl-bracket br"></span>
        <div className="sl-top">
          <span className="sl-code">
            SC <b>01</b> · 00:00:00:00
          </span>
          <span className="chip rec">rec</span>
        </div>
        <div className="sl-title">Cold open — the void</div>
        <div className="sl-meta">WIDE · PUSH-IN · 12s</div>
      </div>
      <div className="slate-line">
        <span className="sl-bracket tl"></span>
        <span className="sl-bracket tr"></span>
        <span className="sl-bracket bl"></span>
        <span className="sl-bracket br"></span>
        <div className="sl-top">
          <span className="sl-code">
            SC <b>02</b> · 00:00:12:00
          </span>
        </div>
        <div className="sl-title">The flash of creation</div>
        <div className="sl-meta">MACRO · CRANE-UP · 14s</div>
      </div>
    </div>
  );
}

function MiniAssets() {
  return (
    <div className="lv lv-assets" aria-hidden="true">
      <span className="asset-kind kind-image">Image</span>
      <span className="asset-kind kind-video">Video</span>
      <span className="asset-kind kind-voice">Voice</span>
      <span className="asset-kind kind-music">Music</span>
      <span className="lv-assets-note">Phase 3</span>
    </div>
  );
}

const PHASE_VISUALS: Record<string, () => React.JSX.Element> = {
  "01": MiniBrief,
  "02": MiniTimeline,
  "03": MiniScript,
  "04": MiniSlate,
  "05": MiniAssets,
};

// ---------- hero film strip ----------

function HeroStrip() {
  return (
    <div className="land-strip" aria-hidden="true">
      <div className="land-strip-holes top"></div>
      <div className="land-strip-frames">
        {FRAMES.map((f) => (
          <div key={f.tc} className={`land-frame${f.rec ? " rec" : ""}`}>
            <div className={`land-frame-art art-${f.art}`}>
              {f.art === "dawn" && (
                <>
                  <i className="a-sky"></i>
                  <i className="a-horizon"></i>
                  <i className="a-sun"></i>
                </>
              )}
              {f.art === "pan" && <i className="a-band"></i>}
              {f.art === "lens" && (
                <>
                  <i className="a-lens r1"></i>
                  <i className="a-lens r2"></i>
                  <i className="a-lens r3"></i>
                </>
              )}
              {f.art === "grid" && (
                <>
                  <i className="a-gv v1"></i>
                  <i className="a-gv v2"></i>
                  <i className="a-gh h1"></i>
                  <i className="a-gh h2"></i>
                  <i className="a-cell"></i>
                </>
              )}
            </div>
            <div className="land-frame-tc">{f.tc}</div>
            <div className="land-frame-cap">
              {f.rec && <span className="rec-dot"></span>}
              {f.cap}
            </div>
          </div>
        ))}
      </div>
      <div className="land-strip-holes bottom"></div>
    </div>
  );
}

// ---------- the main page ----------

export function Landing({ authEnabled }: { authEnabled: boolean }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");

  // Landing CTAs: auth configured → /sign-up (real accounts); local demo →
  // straight into the studio. The middleware handles the enforced-mode redirect
  // contract for any anonymous hit on /studio.
  const enter = () => router.push(authEnabled ? "/sign-up" : "/studio");
  const begin = () => {
    if (!idea.trim()) return;
    router.push(authEnabled ? `/sign-up?redirect_url=/studio` : "/studio");
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
          Slate takes a one-line idea through research, script, and storyboard — a
          production crew of agents working from one source of truth, with your
          approval at every gate. No prompt engineering. No blank canvas.
        </p>

        <div className="land-prompt">
          <span className="land-tc">IN&nbsp;&nbsp;01:00:00:00</span>
          <input
            className="idea-input"
            type="text"
            id="landingIdeaInput"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && begin()}
            placeholder="“A documentary about the history of the universe.”"
            aria-label="Type your video idea"
          />
          <button className="btn btn-rec" onClick={begin} disabled={!idea.trim()}>
            Begin production →
          </button>
        </div>
        <button className="land-skip" onClick={enter}>
          or open the studio without an idea →
        </button>

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

        <HeroStrip />
      </section>

      {/* ============ 5-PHASE PIPELINE ============ */}
      <section className="land-section" id="pipeline">
        <div className="land-kicker">The production pipeline</div>
        <h2>From pitch to picture-lock, in five moves.</h2>
        <p className="land-lead">
          One workflow, five phases — each reviewable and editable. The studio
          never runs ahead of your approval.
        </p>
        <div className="land-phases" role="list" aria-label="Production phases">
          {PHASES.map((p) => {
            const Visual = PHASE_VISUALS[p.n];
            return (
              <div
                key={p.n}
                className={`land-phase${p.future ? " future" : ""}`}
                role="listitem"
              >
                <div className="land-phase-head">
                  <span className="land-phase-n">{p.n}</span>
                  <span className="land-phase-name">{p.name}</span>
                  {p.future && <span className="land-stage-tag">Phase 3</span>}
                </div>
                <div className="land-phase-vis">
                  <Visual />
                </div>
                <p className="land-phase-tag">{p.tag}</p>
              </div>
            );
          })}
        </div>
        <p className="land-note">
          Phases 01–04 ship in this build — asset generation, render, and export arrive with Phase 3.
        </p>
      </section>

      {/* ============ WORKSPACE SHOT ============ */}
      <section className="land-section land-workspace">
        <div className="land-kicker">The cutting room</div>
        <h2>The studio, not the settings.</h2>
        <p className="land-lead">
          No timeline, no node graph, no prompt box mountain. Your project reads
          like a real production: script on paper, scenes as slate lines, scores
          and consistency records in the coverage rail.
        </p>
        <div className="land-shot" aria-hidden="true">
          <div className="land-shot-bar">
            <span className="land-shot-tc">PROD 0042 · SB V2</span>
            <span className="chip live">awaiting review</span>
          </div>
          <div className="land-shot-body">
            <div className="land-shot-paper">
              <div className="p-eyebrow">Scene 01 — cold open</div>
              <div className="lv-title">The First Three Minutes</div>
              <p className="lv-para">
                In the beginning, there was nothing — no light, no time, no
                matter. Then, in less than a second, everything.
              </p>
              <p className="lv-para">
                Hydrogen cooled into stars, stars into galaxies, galaxies into
                dust — and from the dust, us.
              </p>
              <div className="lv-scores">
                <span className="score-chip">
                  Clarity <b>4.5</b>
                  <span className="bar">
                    <i style={{ width: "90%" }}></i>
                  </span>
                </span>
                <span className="score-chip">
                  Overall <b>4.2</b>
                  <span className="bar">
                    <i className="amber" style={{ width: "84%" }}></i>
                  </span>
                </span>
              </div>
            </div>
            <div className="land-shot-rail">
              <div className="cov-card">
                <div className="c-t">
                  Consistency records
                  <span className="rec-dot"></span>
                </div>
                <div className="cov-item">
                  <p>
                    <b>The Narrator</b> — omniscient, warm
                  </p>
                </div>
                <div className="cov-item">
                  <p>
                    <b>The Observable Universe</b> — deep field
                  </p>
                </div>
              </div>
              <div className="cov-card">
                <div className="c-t">Review scores</div>
                <div className="score-line">
                  <span className="nm">Clarity</span>
                  <span className="val">
                    <b>4.5</b>/5
                  </span>
                </div>
                <div className="score-line">
                  <span className="nm">Pacing</span>
                  <span className="val">
                    <b>4.0</b>/5
                  </span>
                </div>
                <div className="score-line">
                  <span className="nm">Engagement</span>
                  <span className="val">
                    <b>4.2</b>/5
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ YOU DIRECT ============ */}
      <section className="land-section land-gates">
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
              advances — script to storyboard, storyboard to production plan.
            </p>
          </div>
          <div className="land-gate">
            <div className="land-gate-top">
              <span className="land-gate-code">Gate 02</span>
              <span className="chip fail">Retake — notes</span>
            </div>
            <p>
              A score misses the threshold, or you want a different take. Type
              your notes; the crew re-runs the stage and brings the revision
              back to the gate.
            </p>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="land-cta">
        <div className="land-cta-in">
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
          <span className="brand">
            <span className="rec-dot"></span> slate
          </span>
          <span className="land-footer-meta">The cutting room · © 2026</span>
          <span className="land-footer-stack">
            NVIDIA Build · Postgres · FFmpeg · React
          </span>
        </div>
      </footer>
    </main>
  );
}
