"use client";

import { useRef, useState } from "react";
import { formatTimecode } from "../lib/mock";

export function SceneCard({
  order,
  title,
  durationSeconds,
  transition,
  status,
  tone,
  meta,
  onReorder,
  index,
}: {
  order: number;
  title: string;
  durationSeconds: number;
  transition: string;
  status: string;
  tone?: "default" | "rec";
  meta?: string;
  onReorder: (from: number, to: number) => void;
  index: number;
}) {
  const [over, setOver] = useState<"top" | "bottom" | null>(null);
  const depthRef = useRef(0); // dragenter/dragleave depth — prevents child-element flicker

  const computeHalf = (e: React.DragEvent<HTMLDivElement>): "top" | "bottom" => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2 ? "bottom" : "top";
  };

  const dropTo = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    depthRef.current = 0;
    setOver(null);
    if (!raw) return; // non-card drag (e.g. selected text) — ignore
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
        <span className={`chip${tone === "rec" ? " rec" : ""}`}>{status}</span>
      </div>
      <div className="sl-title">{title}</div>
      {meta && <div className="sl-meta">{meta}</div>}
      <div className="sl-insert" data-over={over ?? ""} aria-hidden="true"></div>
    </div>
  );
}
