"use client";

import { useState } from "react";
import { DIRECTOR_SUGGESTIONS, STAGES } from "../lib/mock";

export function DirectorBar({
  stage,
  hidden,
  showToast,
  onApprove,
}: {
  stage: number;
  hidden: boolean;
  showToast: (msg: string) => void;
  onApprove: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [stamped, setStamped] = useState(false);
  const isFinal = stage === STAGES.length - 1;

  const send = (text?: string) => {
    const value = (text ?? instruction).trim();
    if (!value) return;
    showToast(`Routed to the studio: “${value}”`);
    setInstruction("");
  };

  const approve = () => {
    setStamped(true);
    onApprove();
    showToast(isFinal ? "Production plan approved - ready to export" : "Take approved - moving on");
    setTimeout(() => setStamped(false), 1600);
  };

  return (
    <div className={`director-bar${hidden ? " hidden" : ""}`}>
      <div className="in">
        <div className="db-top">
          <span className="tc">TC {STAGES[stage]?.tc ?? "RDY"} · REC ●</span>
          <div className="db-suggestions">
            <span className="lbl">Try:</span>
            {DIRECTOR_SUGGESTIONS.map((s) => (
              <button key={s} className="mini-btn" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="db-main">
          <div className="db-input-wrap">
            <input
              className="db-input"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Tell the studio what to change - “make scene 3 more dramatic”…"
              aria-label="Director's instruction"
            />
            <button className="mini-btn solid" onClick={() => send()}>
              Send
            </button>
          </div>
          <div className="db-actions">
            <button
              className="btn-stamp ghost"
              onClick={() => showToast("Change request logged - the studio will revise.")}
            >
              Request changes
            </button>
            <button
              className={`btn-stamp primary${stamped ? " stamped" : ""}`}
              onClick={approve}
            >
              {stamped ? "✓ Approved" : isFinal ? "Approve & export →" : "Approve take →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
