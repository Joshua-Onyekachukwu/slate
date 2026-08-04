"use client";

import { STAGES } from "../lib/mock";

export function StageStepper({
  current,
  onJump,
}: {
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="stepper" role="tablist" aria-label="Production stages">
      {STAGES.map((s, i) => {
        const cls = ["stage"];
        if (i < current) cls.push("approved");
        if (i === current) cls.push("live");
        return (
          <button
            key={s.name}
            className={cls.join(" ")}
            data-stage={i}
            role="tab"
            aria-selected={i === current}
            onClick={() => onJump(i)}
          >
            <div className="tc">{s.tc}</div>
            <div className="nm">
              {i === current && <span className="rec-dot"></span>}
              {s.name}
            </div>
            <div className="st">{s.status}</div>
          </button>
        );
      })}
    </div>
  );
}
