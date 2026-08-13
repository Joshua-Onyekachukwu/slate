"use client";

import { useEffect, useRef, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string; at: string };

// Creative Discovery - the interview view that replaces the workspace panel
// while the planning agent is paused on \"discovery_questions\". Renders the
// saved conversation (assistant questions / user answers) as bubbles, offers
// an input to answer, and reports \"Studio typing…\" while the answer is
// submitted and the workflow advances. The transcript auto-scrolls to the
// latest exchange; multi-line assistant payloads (questions joined by \"\\n\")
// split into one bubble per question.
export function DiscoveryChat({
  conversation,
  idea,
  pending,
  busy,
  onSend,
}: {
  conversation: ChatMsg[];
  idea: string;
  pending: boolean; // workflow is paused awaiting answers
  busy: boolean; // a send is in flight (disables the composer)
  onSend: (content: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation.length, pending, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onSend(text);
  };

  const bubbles: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of conversation) {
    const parts = m.content.split("\n").filter((s) => s.trim().length > 0);
    for (const p of parts.length ? parts : [m.content]) {
      bubbles.push({ role: m.role, text: p });
    }
  }

  const typing = pending || busy;

  return (
    <div className="discovery">
      <div className="p-eyebrow">Creative discovery · Interview</div>
      <div className="disc-transcript" aria-live="polite">
        {bubbles.length === 0 && (
          <div className="disc-bubble assistant">
            <em>“{idea}”</em> — good start. A few quick questions and the studio drafts
            the creative brief.
          </div>
        )}
        {bubbles.map((b, i) => (
          <div key={i} className={`disc-bubble ${b.role}`}>
            {b.text}
          </div>
        ))}
        {typing && (
          <div className="disc-typing">
            <i className="rec-dot" aria-hidden="true"></i> Studio typing…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="disc-input">
        <input
          className="gate-feedback disc-field"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Answer the studio…"
          aria-label="Answer the studio"
          disabled={busy}
        />
        <button className="btn btn-rec btn-sm" onClick={send} disabled={busy || !draft.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
