"use client";

import { formatTimecode, type Scene } from "../lib/mock";

export function ProductionPlan({ scenes, embedded }: { scenes: Scene[]; embedded?: boolean }) {
  return (
    <>
      {!embedded && (
        <>
          <div className="p-eyebrow">
            Ready · Production plan <span className="stamp">awaiting your approval</span>
          </div>
          <h2>The First Three Minutes</h2>
          <div className="p-meta">
            plan v1 · {scenes.length} scenes · 00:04:30 · {scenes.length} prompt packs
          </div>
        </>
      )}

      <div className="plan-section">
        <h3>Script</h3>
        <p className="lead">
          Every atom in your body was forged inside a star. Before that — nothing we can picture.
          This is the story of how the universe began, in the time it takes a kettle to boil… the
          universe, briefly, came to know itself.
        </p>
      </div>

      <div className="plan-section">
        <h3>Scenes in order</h3>
        {scenes.map((s, i) => (
          <div className="plan-row" key={s.id}>
            <span className="idx">SC {String(i + 1).padStart(2, "0")}</span>
            <span className="nm">{s.title}</span>
            <span className="ds">
              {s.meta} · {formatTimecode(s.durationSeconds)}
            </span>
          </div>
        ))}
      </div>

      <div className="plan-section">
        <h3>Crew sheet — consistency</h3>
        <div className="crew-grid">
          <div className="crew-card">
            <div className="k">Characters</div>
            <div className="v">
              Narrator — unnamed, omniscient <small>· consistent voice</small>
            </div>
          </div>
          <div className="crew-card">
            <div className="k">Locations</div>
            <div className="v">Deep space (void), galaxy web, solar system, Earth at night</div>
          </div>
          <div className="crew-card">
            <div className="k">Editor</div>
            <div className="v">
              Per-scene transitions + music cues, set on each scene's content
            </div>
          </div>
        </div>
      </div>

      {!embedded && (
        <div className="plan-section">
          <h3>Prompt packs</h3>
          {scenes.map((s, i) => (
            <div className="plan-row" key={s.id}>
              <span className="idx">SC {String(i + 1).padStart(2, "0")}</span>
              <span className="nm">image · video · vo · music · sfx</span>
              <span className="ds">
                {s.transition} · {s.musicCue}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
