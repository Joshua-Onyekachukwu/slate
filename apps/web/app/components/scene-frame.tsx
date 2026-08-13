"use client";

import { formatTimecode } from "../lib/mock";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Visual storyboard frame for one scene, shown alongside its slate line in the
// workspace. When the scene has a READY image asset with a real http(s) URL it
// renders the generated frame; otherwise (fake provider returns fake:// URLs,
// or nothing generated yet) it renders a designed placeholder treatment - a
// 16:9 finder frame with the scene's timecode and camera direction burned in.
export function SceneFrame({
  order,
  durationSeconds,
  title,
  cameraDirection,
  assetUrl,
  approved,
}: {
  order: number;
  durationSeconds: number;
  title: string;
  cameraDirection: string;
  assetUrl: string | null;
  approved: boolean;
}) {
  const real = assetUrl && /^https?:\/\//.test(assetUrl) ? assetUrl : null;
  return (
    <figure className={`scene-frame${approved ? " ok" : ""}`} data-testid={`scene-frame-${order}`}>
      {real ? (
        <img
          className="sf-img"
          src={real}
          alt={`Storyboard frame ${order}: ${title}`}
          loading="lazy"
        />
      ) : (
        <div className="sf-ph" aria-hidden="true">
          <span className="sf-tc">{formatTimecode(durationSeconds)}</span>
          <span className="sf-note">
            <i className="rec-dot"></i>
            {approved ? "FRAME LOCKED" : "AWAITING GENERATION"}
          </span>
          <span className="sf-shot">{cameraDirection}</span>
        </div>
      )}
      <figcaption>
        <span className="sf-code">SC {pad2(order)}</span>
        <span className="sf-title">{title}</span>
        <span className="sf-tag">{real ? "GEN" : approved ? "LOCKED" : "PLACEHOLDER"}</span>
      </figcaption>
    </figure>
  );
}
