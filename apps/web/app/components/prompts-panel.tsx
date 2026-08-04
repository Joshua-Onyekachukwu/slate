"use client";

import { formatTimecode, type Scene } from "../lib/mock";

export function PromptsPanel({
  scenes,
  showToast,
}: {
  scenes: Scene[];
  showToast: (msg: string) => void;
}) {
  return (
    <div className="scene-list">
      {scenes.map((s, i) => (
        <div key={s.id} className="scene-card" style={{ cursor: "default" }}>
          <div className="sc-top">
            <span className="sc-code">
              SC {String(i + 1).padStart(2, "0")} · <b>{s.title}</b> ·{" "}
              {formatTimecode(s.durationSeconds)}
            </span>
            <span className="chip" style={{ borderColor: "var(--line-paper)", color: "#5c554a" }}>
              image · video · vo · music · sfx
            </span>
          </div>
          <div className="sc-meta">
            transition: {s.transition} · music cue: {s.musicCue}
          </div>
          <div className="sc-actions">
            <button
              className="mini-btn"
              onClick={() => showToast(`Regenerating SC ${String(i + 1).padStart(2, "0")} image prompt…`)}
            >
              Regenerate image
            </button>
            <button
              className="mini-btn"
              onClick={() => showToast(`Full pack queued for SC ${String(i + 1).padStart(2, "0")}`)}
            >
              Regenerate pack
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
