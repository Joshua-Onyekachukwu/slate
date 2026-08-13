"use client";

import { useMemo, useState } from "react";
import { SCRIPT_PARAGRAPHS, SCRIPT_TITLE } from "../lib/mock";

type Fmt = "bold" | "italic" | "code" | "h2" | "quote" | "list";

export function ScriptEditor({
  activePara,
  onActivePara,
  showToast,
}: {
  activePara: string;
  onActivePara: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const [words, setWords] = useState(() =>
    SCRIPT_PARAGRAPHS.reduce((n, p) => n + p.text.trim().split(/\s+/).length, 0)
  );
  const [saved, setSaved] = useState(true);
  const [active, setActive] = useState<Set<Fmt>>(new Set());

  const readTime = useMemo(() => {
    const mins = words / 150;
    return `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, "0")}`;
  }, [words]);

  const runCmd = (fmt: Fmt, cmd: string, value?: string, label?: string) => {
    try {
      document.execCommand(cmd, false, value);
      setActive((prev) => {
        const next = new Set(prev);
        next.has(fmt) ? next.delete(fmt) : next.add(fmt);
        return next;
      });
      showToast(`${label ?? fmt} - applied to selection`);
    } catch {
      showToast(`${label ?? fmt} - routed to the studio for review`);
    }
  };

  const comment = () =>
    showToast(
      `Comment pinned to paragraph ${activePara.toUpperCase()} - routed to the script reviewer`
    );
  const askStudio = () =>
    showToast("Rewrite suggestion requested for this paragraph - agent will draft an alternative");

  const recount = (e: React.FormEvent<HTMLDivElement>) => {
    setSaved(false);
    const text = (e.currentTarget.textContent ?? "").trim();
    // Recompute total: swap this paragraph's words, keep others' static contribution.
    const own = text ? text.split(/\s+/).length : 0;
    const idx = Number(e.currentTarget.dataset.idx ?? 0);
    const rest = SCRIPT_PARAGRAPHS.filter((_, i) => i !== idx).reduce(
      (n, p) => n + p.text.trim().split(/\s+/).length,
      0
    );
    setWords(rest + own);
  };

  const btn = (fmt: Fmt, label: string, onClick: () => void, children: React.ReactNode) => (
    <button
      className={`tt-btn${active.has(fmt) ? " on" : ""}`}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={label}
      aria-pressed={active.has(fmt)}
    >
      {children}
    </button>
  );

  return (
    <div className="script-edit">
      <div className="tt-toolbar" role="toolbar" aria-label="Text formatting">
        {btn("bold", "Bold", () => runCmd("bold", "bold", undefined, "Bold"), <b>B</b>)}
        {btn("italic", "Italic", () => runCmd("italic", "italic", undefined, "Italic"), <i>I</i>)}
        {btn(
          "code",
          "Inline code",
          () => runCmd("code", "insertHTML", "<code>⌘K</code>", "Inline code"),
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{"</>"}</span>
        )}
        <span className="tt-sep" aria-hidden="true"></span>
        {btn("h2", "Heading 2", () => runCmd("h2", "formatBlock", "h2", "Heading 2"), "H2")}
        {btn("quote", "Blockquote", () => runCmd("quote", "formatBlock", "blockquote", "Quote"), "❝")}
        {btn(
          "list",
          "Bullet list",
          () => runCmd("list", "insertUnorderedList", undefined, "Bullet list"),
          "•="
        )}
        <span className="tt-sep" aria-hidden="true"></span>
        <button
          className="tt-btn"
          onClick={comment}
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Add comment"
        >
          💬
        </button>
        <button
          className="tt-btn"
          onClick={askStudio}
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Ask the studio to rewrite"
        >
          ✨
        </button>
      </div>

      <div className="tt-doc">
        <div className="script-title" contentEditable suppressContentEditableWarning>
          {SCRIPT_TITLE}
        </div>
        <div className="script-meta">TITLE · v3 · 21:46</div>
        {SCRIPT_PARAGRAPHS.map((p, i) => (
          <div
            key={p.id}
            className={`script-para${p.id === activePara ? " active" : ""}${
              p.flagged ? " flagged" : ""
            }`}
            contentEditable
            suppressContentEditableWarning
            onClick={() => onActivePara(p.id)}
            onInput={recount}
            onBlur={() => setSaved(true)}
            data-para={p.id}
            data-idx={i}
          >
            {p.text}
          </div>
        ))}
        <div className="tt-statusbar">
          <span className="tt-words">
            <b>{words.toLocaleString()}</b> words
          </span>
          <span className="tt-read">≈ {readTime} read</span>
          <span className="tt-saved">{saved ? "Saved" : "Editing…"}</span>
          <span className="tt-hint">
            TipTap · click a paragraph to see its review note in the rail
          </span>
        </div>
      </div>
    </div>
  );
}
