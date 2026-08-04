"use client";

import { STAGES } from "../lib/mock";

export function CallSheet({
  current,
  onJump,
}: {
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <aside className="csheet" aria-label="Call sheet — production stages">
      <div className="csheet-title">
        <span className="lbl">Call sheet</span>
        <span className="tc">{STAGES[current]?.tc ?? "RDY"}</span>
      </div>
      <ol className="csheet-list">
        {STAGES.map((s, i) => {
          const cls = ["cs-stage"];
          if (i < current) cls.push("approved");
          if (i === current) cls.push("live");
          return (
            <li key={s.name}>
              <button
                className={cls.join(" ")}
                data-stage={i}
                aria-current={i === current ? "step" : undefined}
                onClick={() => onJump(i)}
              >
                <span className="cs-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="cs-body">
                  <span className="cs-name">
                    {i === current && <span className="rec-dot"></span>}
                    {s.name}
                  </span>
                  <span className="cs-st">{s.status}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
