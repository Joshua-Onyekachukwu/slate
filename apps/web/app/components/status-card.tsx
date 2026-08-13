"use client";

import type { ReactNode } from "react";

// Standardized empty / loading / error states for the studio and the workspace,
// drawn in the cutting-room token language: a slate card with corner brackets,
// a mono kicker with a status dot, and an optional action slot (retry / CTA).
//
//   loading - pulsing REC dot + skeleton bars; no action slot
//   empty   - quiet kicker, descriptive body, optional call to action
//   error   - REC-tinted kicker; the action slot should offer a retry
export function StatusCard({
  tone,
  kicker,
  title,
  body,
  action,
  compact,
}: {
  tone: "empty" | "loading" | "error";
  kicker: string;
  title: string;
  body?: string;
  action?: ReactNode;
  // Compact variant for narrow rails (e.g. the workspace call sheet): no
  // auto-centering, tight padding, left-aligned, small display title.
  compact?: boolean;
}) {
  return (
    <section
      className={`status-card tone-${tone}${compact ? " compact" : ""}`}
      role={tone === "error" ? "alert" : undefined}
      aria-live={tone === "loading" ? "polite" : undefined}
    >
      <span className="sc-bracket tl" aria-hidden="true"></span>
      <span className="sc-bracket tr" aria-hidden="true"></span>
      <span className="sc-bracket bl" aria-hidden="true"></span>
      <span className="sc-bracket br" aria-hidden="true"></span>
      <div className="sc-kicker">
        {(tone === "loading" || tone === "error") && <i className="rec-dot" aria-hidden="true"></i>}
        {kicker}
      </div>
      <h2 className="sc-title">{title}</h2>
      {body && <p className="sc-body">{body}</p>}
      {tone === "loading" ? (
        <div className="sc-skeleton" aria-hidden="true">
          <span className="sk l1"></span>
          <span className="sk l2"></span>
          <span className="sk l3"></span>
        </div>
      ) : (
        action && <div className="sc-action">{action}</div>
      )}
    </section>
  );
}
