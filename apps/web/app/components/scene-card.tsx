"use client";

import { useRef, useState } from "react";
import { formatTimecode } from "../lib/mock";
import type { SceneContent } from "../lib/api";

const TRANSITIONS = ["CUT", "DISSOLVE", "FADE", "WIPE"];

export function SceneCard({
  order,
  durationSeconds,
  transition,
  status,
  tone,
  meta,
  onReorder,
  index,
  content,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
}: {
  order: number;
  durationSeconds: number;
  transition: string;
  status: string;
  tone?: "default" | "rec";
  meta?: string;
  onReorder: (from: number, to: number) => void;
  index: number;
  content: SceneContent;
  editing: boolean;
  onEdit: () => void;
  onSave: (content: SceneContent) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [over, setOver] = useState<"top" | "bottom" | null>(null);
  const depthRef = useRef(0); // dragenter/dragleave depth - prevents child-element flicker
  const [draft, setDraft] = useState<SceneContent | null>(null);

  const computeHalf = (e: React.DragEvent<HTMLDivElement>): "top" | "bottom" => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2 ? "bottom" : "top";
  };

  const dropTo = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    depthRef.current = 0;
    setOver(null);
    if (!raw) return; // non-card drag (e.g. selected text) - ignore
    const from = Number(raw);
    if (!Number.isInteger(from) || from < 0) return;
    const below = computeHalf(e) === "bottom";
    // Insert-before/after semantics for an array move; no-op when dropped on itself.
    let to: number;
    if (from < index) to = below ? index : index - 1;
    else if (from > index) to = below ? index + 1 : index;
    else return;
    onReorder(from, to);
  };

  // Inline edit mode: the slate-line frame holds a small form; drag is off.
  if (editing) {
    const d = draft ?? content;
    const set = <K extends keyof SceneContent>(k: K, v: SceneContent[K]) => setDraft({ ...d, [k]: v });
    return (
      <div className="slate-line editing" data-testid={`scene-card-${order}`}>
        <span className="sl-bracket tl" aria-hidden="true"></span>
        <span className="sl-bracket tr" aria-hidden="true"></span>
        <span className="sl-bracket bl" aria-hidden="true"></span>
        <span className="sl-bracket br" aria-hidden="true"></span>
        <div className="sl-top">
          <span className="sl-code">
            SC {String(order).padStart(2, "0")} · <b>editing</b>
          </span>
          <span className="chip rec">Editing</span>
        </div>
        <div className="scene-edit">
          <label>
            Title
            <input value={d.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label>
            Narration
            <textarea rows={2} value={d.narration} onChange={(e) => set("narration", e.target.value)} />
          </label>
          <label>
            Visual description
            <textarea rows={2} value={d.visualDescription} onChange={(e) => set("visualDescription", e.target.value)} />
          </label>
          <label>
            Camera
            <input value={d.cameraDirection} onChange={(e) => set("cameraDirection", e.target.value)} />
          </label>
          <div className="scene-edit-row">
            <label>
              Duration (s)
              <input type="number" min={1} value={d.durationSeconds} onChange={(e) => set("durationSeconds", Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label>
              Transition
              <select value={d.transition} onChange={(e) => set("transition", e.target.value)}>
                {/* keep a model-returned value that isn't in the preset list */}
                {!TRANSITIONS.includes(d.transition) && <option>{d.transition}</option>}
                {TRANSITIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Music cue
            <input value={d.musicCue} onChange={(e) => set("musicCue", e.target.value)} />
          </label>
          <div className="scene-edit-actions">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setDraft(null); // discard unsaved edits - reopening must show server truth
                onCancel();
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button className="btn btn-rec" onClick={() => onSave(d)} disabled={saving}>
              {saving ? "Saving…" : "Save scene"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`scene-card-${order}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        depthRef.current += 1;
        setOver(computeHalf(e));
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(computeHalf(e));
      }}
      onDragLeave={() => {
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setOver(null);
      }}
      onDrop={dropTo}
      onDragEnd={() => {
        depthRef.current = 0;
        setOver(null);
      }}
      className={`slate-line${tone === "rec" ? " rec" : ""}${over ? ` over-${over}` : ""}`}
    >
      <span className="sl-bracket tl" aria-hidden="true"></span>
      <span className="sl-bracket tr" aria-hidden="true"></span>
      <span className="sl-bracket bl" aria-hidden="true"></span>
      <span className="sl-bracket br" aria-hidden="true"></span>
      <span className="sl-handle" aria-hidden="true">
        ⠿
      </span>
      <div className="sl-top">
        <span className="sl-code">
          SC {String(order).padStart(2, "0")} ·{" "}
          <b>{formatTimecode(durationSeconds)}</b> · {transition}
        </span>
        <span className="sl-actions">
          <button className="mini-btn" onClick={onEdit} aria-label={`Edit scene ${order}`}>EDIT</button>
          <span className={`chip${tone === "rec" ? " rec" : ""}`}>{status}</span>
        </span>
      </div>
      <div className="sl-title">{content.title}</div>
      {meta && <div className="sl-meta">{meta}</div>}
      <div className="sl-insert" data-over={over ?? ""} aria-hidden="true"></div>
    </div>
  );
}
