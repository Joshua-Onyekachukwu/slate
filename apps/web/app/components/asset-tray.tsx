"use client";

import { ASSET_KIND_LABEL, STAGE_ASSETS, type Asset } from "../lib/mock";

const STATUS_CLASS: Record<Asset["status"], string> = {
  approved: "done",
  draft: "live",
  retake: "fail",
};

export function AssetTray({ stage, showToast }: { stage: number; showToast: (msg: string) => void }) {
  const assets = STAGE_ASSETS[stage] ?? [];

  return (
    <div className="cov-card">
      <div className="c-t">Asset tray</div>
      {assets.length === 0 ? (
        <div className="cov-item">
          <p>
            Generated assets appear here — images, video, voice, music, SFX — and flow forward into
            later stages automatically.
          </p>
        </div>
      ) : (
        <>
          {assets.map((a) => (
            <div key={a.id} className="asset-row">
              <span className={`asset-kind kind-${a.kind}`}>{ASSET_KIND_LABEL[a.kind]}</span>
              <span className="asset-name">{a.name}</span>
              <span className={`chip ${STATUS_CLASS[a.status]}`}>{a.status}</span>
              <span className="asset-actions">
                <button
                  className="mini-btn"
                  onClick={() => showToast(`Regenerating ${a.name}…`)}
                  aria-label={`Regenerate ${a.name}`}
                >
                  ↻
                </button>
                <button
                  className="mini-btn"
                  onClick={() => showToast(`${a.name} approved — added to master`)}
                  aria-label={`Approve ${a.name}`}
                >
                  ✓
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
