"use client";

import { TAKES } from "../lib/mock";

export function TakeLog({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <div className="cov-card">
      <div className="c-t">Take log</div>
      {TAKES.map((t) => (
        <div key={t.id} className={`ver-row${t.current ? " current" : ""}`}>
          <span className="v">
            {t.label}
            {t.source === "user" ? " · edited" : ""}
          </span>
          <span>{t.time}</span>
        </div>
      ))}
      <div className="cov-actions" style={{ paddingTop: 8 }}>
        <button className="mini-btn" onClick={() => showToast("Compared v1 vs v2 - narration tightened")}>
          Compare
        </button>
        <button className="mini-btn" onClick={() => showToast("Rolled back to v1")}>
          Rollback
        </button>
        <button className="mini-btn" onClick={() => showToast("Queued a variation take…")}>
          Variation
        </button>
      </div>
    </div>
  );
}
