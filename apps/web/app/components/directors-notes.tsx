"use client";

import { SCRIPT_PARAGRAPHS, STAGES, type DemoState } from "../lib/mock";
import { AssetTray } from "./asset-tray";
import { TakeLog } from "./take-log";

export function DirectorsNotes({
  stage,
  demoState,
  showToast,
  activePara = "p1",
}: {
  stage: number;
  demoState: DemoState;
  showToast: (msg: string) => void;
  activePara?: string;
}) {
  if (demoState !== "normal") {
    return (
      <div className="coverage" data-testid="notes-rail">
        {demoState === "loading" && (
          <div className="cov-card">
            <div className="c-t">
              Agent status <span className="rec-dot"></span>
            </div>
            <div className="cov-item">
              <p>
                Planning agent on <b>nvidia-llama-3.3-70b</b> — drafting {STAGES[stage]?.name.toLowerCase()}.
              </p>
            </div>
          </div>
        )}
        {demoState === "streaming" && (
          <div className="cov-card">
            <div className="c-t">
              Live <span className="rec-dot"></span>
            </div>
            <div className="cov-item">
              <p>Streaming output to the canvas. You can interrupt any time.</p>
              <div className="cov-actions">
                <button className="mini-btn solid" onClick={() => showToast("Generation interrupted — partial saved")}>
                  Interrupt
                </button>
              </div>
            </div>
          </div>
        )}
        {demoState === "retake" && (
          <div className="cov-card">
            <div className="c-t">Error</div>
            <div className="cov-item">
              <p>
                <b>code:</b> PROVIDER_429 · <b>stage:</b> {STAGES[stage]?.name.toLowerCase()} · partial draft saved.
              </p>
            </div>
          </div>
        )}
        {demoState === "empty" && (
          <div className="cov-card">
            <div className="c-t">Empty state</div>
            <div className="cov-item">
              <p>Designed: no projects yet → the studio home invites the first idea.</p>
            </div>
          </div>
        )}
        <TakeLog showToast={showToast} />
      </div>
    );
  }

  return (
    <div className="coverage" data-testid="notes-rail">
      <StageCoverage stage={stage} activePara={activePara} showToast={showToast} />
      <TakeLog showToast={showToast} />
      <AssetTray stage={stage} showToast={showToast} />
    </div>
  );
}

function StageCoverage({
  stage,
  activePara,
  showToast,
}: {
  stage: number;
  activePara: string;
  showToast: (m: string) => void;
}) {
  switch (stage) {
    case 0:
      return (
        <div className="cov-card">
          <div className="c-t">
            Studio notes <span className="rec-dot"></span>
          </div>
          <div className="cov-item">
            <p>
              Your answers cover audience, platform, length, and tone. One more signal would help:{" "}
              <b>any visual references</b>.
            </p>
            <div className="cov-actions">
              <button className="mini-btn solid" onClick={() => showToast("Note applied — drafting brief")}>
                Apply
              </button>
              <button className="mini-btn">Dismiss</button>
            </div>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="cov-card">
          <div className="c-t">Suggestions</div>
          <div className="cov-item">
            <p>
              A <b>female narration</b> pairs well with a wonder-driven tone for general audiences.
            </p>
            <div className="cov-actions">
              <button className="mini-btn solid" onClick={() => showToast("Applied — narration locked")}>
                Apply
              </button>
              <button className="mini-btn">Dismiss</button>
            </div>
          </div>
          <div className="cov-item">
            <p>
              4:30 is the sweet spot for YouTube retention; <b>consider a cold open</b>.
            </p>
            <div className="cov-actions">
              <button className="mini-btn solid" onClick={() => showToast("Applied — cold open noted")}>
                Apply
              </button>
              <button className="mini-btn">Dismiss</button>
            </div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="cov-card">
          <div className="c-t">Factual score</div>
          <div className="score-line">
            <span className="nm">Sourced</span>
            <span className="val">
              <b>6</b>/6
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Confidence</span>
            <span className="val">
              <b>0.98</b>
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Unverified</span>
            <span className="val">
              <b>0</b> claims
            </span>
          </div>
          <div className="cov-item">
            <p>
              All timeline claims map to a source. The "first stars 13.5 bya" figure matches
              Planck-era estimates.
            </p>
          </div>
        </div>
      );
    case 3:
      return (
        <>
          <div className="cov-card">
            <div className="c-t">Script scores · v3</div>
            <ScoreLine name="Clarity" value="4.3" pct={86} />
            <ScoreLine name="Pacing" value="4.1" pct={82} />
            <ScoreLine name="Engagement" value="4.4" pct={88} />
            <ScoreLine name="Retention" value="4.2" pct={84} />
            <ScoreLine name="Redundancy" value="4.0" pct={80} />
            <ScoreLine name="Factual" value="3.9" pct={78} amber />
            <div className="cov-actions" style={{ paddingTop: 10 }}>
              <button className="mini-btn solid" onClick={() => showToast("Regenerating script v4…")}>
                Regenerate
              </button>
            </div>
          </div>
          <div className="cov-card">
            <div className="c-t">Review notes · inline</div>
            <p className="cov-lead">Click a paragraph in the editor to see its note here.</p>
            {SCRIPT_PARAGRAPHS.map((p) => (
              <div
                key={p.id}
                className={`note-row${p.id === activePara ? " active" : ""}${p.flagged ? " flagged" : ""}`}
              >
                <span className="nr-p">{p.id.toUpperCase()}</span>
                <span className="nr-score">{p.score}</span>
                <span className="nr-text">{p.note}</span>
              </div>
            ))}
            <div className="cov-actions" style={{ paddingTop: 8 }}>
              <button className="mini-btn" onClick={() => showToast("Applied note to paragraph " + activePara.toUpperCase())}>
                Apply to {activePara.toUpperCase()}
              </button>
              <button className="mini-btn" onClick={() => showToast("Sent notes to the writer agent")}>
                Send to writer
              </button>
            </div>
          </div>
        </>
      );
    case 4:
      return (
        <div className="cov-card">
          <div className="c-t">Consistency records</div>
          <div className="cov-item">
            <p>
              <b>Characters:</b> 1 (Narrator) — consistent across scenes.
            </p>
          </div>
          <div className="cov-item">
            <p>
              <b>Locations:</b> void → galaxy web → solar system → Earth — continuity held.
            </p>
          </div>
          <div className="cov-item">
            <p>
              <b>Editor:</b> SC 05→06 transition lands on the resolve; music swells cleared.
            </p>
          </div>
          <div className="cov-actions">
            <button className="mini-btn" onClick={() => showToast("Suggesting a new transition…")}>
              Suggest transition
            </button>
          </div>
        </div>
      );
    case 5:
      return (
        <div className="cov-card">
          <div className="c-t">Production coverage</div>
          <div className="score-line">
            <span className="nm">Packs ready</span>
            <span className="val">
              <b>6</b>/6
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Transitions set</span>
            <span className="val">
              <b>6</b>/6
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Music cues set</span>
            <span className="val">
              <b>6</b>/6
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Runtime</span>
            <span className="val">
              <b>00:04:30</b>
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Score</span>
            <span className="val">
              <b>4.1</b>
            </span>
          </div>
          <div className="ver-row current">
            <span className="v">SC 03 v2 · edited</span>
            <span>21:55</span>
          </div>
          <div className="cov-item">
            <p>Scenes finalized, prompt packs set, crew sheet locked. Approve to export the plan package.</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="cov-card">
          <div className="c-t">Plan summary</div>
          <div className="score-line">
            <span className="nm">Scenes</span>
            <span className="val">
              <b>6</b>
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Runtime</span>
            <span className="val">
              <b>00:04:30</b>
            </span>
          </div>
          <div className="score-line">
            <span className="nm">Score</span>
            <span className="val">
              <b>4.1</b>
            </span>
          </div>
          <div className="cov-item">
            <p>Approve to export the plan package. Regeneration is available per scene at any time.</p>
          </div>
        </div>
      );
  }
}

function ScoreLine({
  name,
  value,
  pct,
  amber,
}: {
  name: string;
  value: string;
  pct: number;
  amber?: boolean;
}) {
  return (
    <div className="score-line">
      <span className="nm">{name}</span>
      <span className="val">
        <b>{value}</b>
        <span className="bar">
          <i className={amber ? "amber" : ""} style={{ width: `${pct}%` }}></i>
        </span>
      </span>
    </div>
  );
}
