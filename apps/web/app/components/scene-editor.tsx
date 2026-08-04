"use client";

import { useState } from "react";
import { PROMPT_TABS, type Scene } from "../lib/mock";

export function SceneEditor({
  scene,
  onSave,
  showToast,
}: {
  scene: Scene;
  onSave: (patch: { title?: string; content?: Partial<Scene> }) => void;
  showToast: (msg: string) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tab, setTab] = useState(0);

  return (
    <>
      <div className="field">
        <label>Title</label>
        <input
          defaultValue={scene.title}
          onBlur={(e) => onSave({ title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Narration</label>
        <textarea
          defaultValue={scene.narration}
          onBlur={(e) => onSave({ content: { narration: e.target.value } })}
        />
      </div>
      <div className="field">
        <label>Visual description</label>
        <textarea
          defaultValue={scene.visual}
          onBlur={(e) => onSave({ content: { visual: e.target.value } })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Camera direction</label>
          <input
            defaultValue={scene.camera}
            onBlur={(e) => onSave({ content: { camera: e.target.value } })}
          />
        </div>
        <div className="field">
          <label>Duration</label>
          <input
            defaultValue={scene.duration}
            onBlur={(e) => onSave({ content: { duration: e.target.value } })}
          />
        </div>
        <div className="field">
          <label>Transition</label>
          <select
            defaultValue={scene.transition}
            onChange={(e) => onSave({ content: { transition: e.target.value } })}
          >
            <option>CUT</option>
            <option>DISSOLVE</option>
            <option>FADE</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Music cue</label>
        <input
          defaultValue={scene.musicCue}
          onBlur={(e) => onSave({ content: { musicCue: e.target.value } })}
        />
      </div>

      <div
        className={`adv${showAdvanced ? " on" : ""}`}
        id="advToggle"
        role="button"
        tabIndex={0}
        onClick={() => {
          setShowAdvanced((v) => !v);
          if (!showAdvanced) showToast("Advanced — prompt packs revealed");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowAdvanced((v) => !v);
          }
        }}
      >
        <div className="sw"></div>
        <div className="t">Advanced — prompt packs</div>
      </div>

      <div className="prompt-tabs">
        <div className="tab-row" role="tablist" aria-label="Prompt pack types">
          {PROMPT_TABS.map((t, i) => (
            <button
              key={t.key}
              className={`tab${i === tab ? " active" : ""}`}
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {PROMPT_TABS.map((t, i) => (
          <div key={t.key} className={`prompt-pane${i === tab ? " active" : ""}`}>
            <div className="pp-label">
              {t.label} prompt · SC {String(scene.id).padStart(2, "0")}
            </div>
            <code>{scene.prompts[t.key]}</code>
          </div>
        ))}
      </div>
    </>
  );
}
