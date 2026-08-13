import type { ReactNode } from "react";

/* ================= STAGES ================= */

export type StageDef = {
  tc: string;
  name: string;
  status: string;
};

export const STAGES: StageDef[] = [
  { tc: "01 · 00:00:12", name: "Idea", status: "Approved" },
  { tc: "02 · 00:00:48", name: "Brief", status: "Approved" },
  { tc: "03 · 00:02:14", name: "Research", status: "Approved" },
  { tc: "04 · 00:03:02", name: "Script", status: "Approved" },
  { tc: "05 · 00:03:41", name: "Storyboard", status: "Approved" },
  { tc: "06 · 00:04:05", name: "Production", status: "Awaiting review" },
];

export const APPROVE_NOTES: ReactNode[] = [
  (
    <>
      <b>Discovery complete</b> - 3 clarifying questions answered. Approve to lock the creative
      brief.
    </>
  ),
  (
    <>
      <b>Brief ready</b> - topic, audience, style and runtime are set. Approve to begin research.
    </>
  ),
  (
    <>
      <b>Research packet ready</b> - timeline and sources compiled. Approve to move to the script.
    </>
  ),
  (
    <>
      <b>Script v3 scores 4.1</b> - above the 3.8 threshold. Approve to storyboard.
    </>
  ),
  (
    <>
      <b>3 scenes storyboarded</b> - drag to reorder, edit per scene. Approve to finalize scenes.
    </>
  ),
  (
    <>
      <b>Production ready</b> - scenes finalized, prompt packs set, crew sheet locked. Approve to
      export.
    </>
  ),
];

/* ================= PROJECTS ================= */

export type Project = {
  id: string;
  title: string;
  meta: string;
  chip: string;
  chipTone: "live" | "done" | "fail" | "rec";
  progress: number;
  stage: number;
};

export const PROJECTS: Project[] = [
  {
    id: "0042",
    title: "The First Marathon",
    meta: "16:9 · 00:04:30 · doc · updated 21:40",
    chip: "Plan ready",
    chipTone: "rec",
    progress: 100,
    stage: 5,
  },
  {
    id: "0041",
    title: "How Coffee Changed the World",
    meta: "9:16 · 00:02:10 · short · updated 19:12",
    chip: "Storyboard",
    chipTone: "live",
    progress: 74,
    stage: 4,
  },
  {
    id: "0039",
    title: "The Last Lightkeepers",
    meta: "16:9 · 00:03:20 · doc · updated Aug 02",
    chip: "Script",
    chipTone: "live",
    progress: 52,
    stage: 3,
  },
  {
    id: "0038",
    title: "Why Deep Sea Creatures Glow",
    meta: "16:9 · 00:03:00 · doc · updated Aug 02",
    chip: "Retake",
    chipTone: "fail",
    progress: 38,
    stage: 2,
  },
  {
    id: "0036",
    title: "A Year on a Rooftop Garden",
    meta: "1:1 · 00:01:45 · slice · updated Jul 29",
    chip: "Brief ✓",
    chipTone: "done",
    progress: 26,
    stage: 1,
  },
  {
    id: "0034",
    title: "How Fonts Decide What We Trust",
    meta: "16:9 · ? · essay · updated Jul 27",
    chip: "Discovery",
    chipTone: "live",
    progress: 12,
    stage: 0,
  },
];

/* ================= SCENES ================= */

export type PromptKind = "image" | "video" | "narration" | "music" | "sfx";

export const PROMPT_TABS: { key: PromptKind; label: string }[] = [
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "narration", label: "Narration" },
  { key: "music", label: "Music" },
  { key: "sfx", label: "SFX" },
];

export type SceneContent = {
  narration: string;
  visual: string;
  camera: string;
  duration: string;
  transition: string;
  musicCue: string;
};

export type Scene = SceneContent & {
  id: number;
  title: string;
  durationSeconds: number;
  meta: string;
  status: string;
  tone: "default" | "rec";
  prompts: Record<PromptKind, string>;
};

// The demo film mirrors the landing and the demo queue: three shots of a
// runner's first marathon (cold open / the moment / the finish).
export const SCENES: Scene[] = [
  {
    id: 1,
    title: "The cold open",
    durationSeconds: 31,
    transition: "CUT",
    meta: "Slow push-in · narration 00:28 · music: low drone",
    status: "Approved",
    tone: "default",
    narration: "First steps into an empty street at dawn - she smiles before the gun.",
    visual:
      "A runner alone on an empty city street in morning light, breath visible in the cold air.",
    camera: "Slow push-in from a wide street",
    duration: "00:00:31",
    musicCue: "Low drone",
    prompts: {
      image:
        "A woman runner alone on an empty city street at dawn, morning light on her face, photoreal documentary still, no text.",
      video:
        "Static wide as a lone runner starts down an empty street, 31s, 24fps, slow push-in, no camera shake.",
      narration:
        "Female, warm documentary register. Pace 140 wpm, quiet anticipation. 28s. Emphasis: \u201csmiles before the gun\u201d.",
      music: "Low drone, heartbeat pulse, sparse - no melody until the start gun.",
      sfx: "Distant city hum, footsteps, near-silence otherwise.",
    },
  },
  {
    id: 2,
    title: "The moment",
    durationSeconds: 32,
    transition: "DISSOLVE",
    meta: "Over-the-shoulder tracking · strings enter",
    status: "Approved",
    tone: "default",
    narration: "Two runners share a laugh at the turnaround - the race's quiet best part.",
    visual: "Two runners side by side at the turnaround, laughing mid-stride, water cups in hand.",
    camera: "Over-the-shoulder tracking shot",
    duration: "00:00:32",
    musicCue: "Strings enter",
    prompts: {
      image:
        "Two runners sharing a laugh at a race turnaround, golden hour, motion and joy, photoreal, 16:9.",
      video:
        "Over-the-shoulder tracking as two runners laugh at the turnaround, 32s, 24fps, warm key, no shake.",
      narration:
        "Female, warm. 142 wpm, easy affection. 29s. Emphasis: \u201cthe race's quiet best part\u201d.",
      music: "Strings enter softly, rising major - the warmth of the piece.",
      sfx: "Footfall rhythm, distant crowd, cups landing.",
    },
  },
  {
    id: 3,
    title: "The finish",
    durationSeconds: 33,
    transition: "CUT",
    meta: "Wide crane-down · narration resolves · anthem swell",
    status: "Retake - music overlap",
    tone: "rec",
    narration: "Arms up at the line. The crowd answers.",
    visual: "A runner crossing the finish line, arms raised, the crowd on its feet behind the tape.",
    camera: "Wide crane-down over the finish line",
    duration: "00:00:33",
    musicCue: "Anthem swell",
    prompts: {
      image:
        "A runner crossing a finish line with arms raised, crowd on its feet, photoreal documentary grade, no text overlays.",
      video:
        "Wide crane-down over the finish line as a runner crosses with arms up, 33s, 24fps, crowd energy, no shake.",
      narration:
        "Female, warm. 138 wpm, final resolve. 30s. Emphasis: \u201cthe crowd answers\u201d.",
      music: "Full theme resolves, then fades to the crowd.",
      sfx: "Roar of the crowd, tape snapping, final breath.",
    },
  },
];

/* ================= SCRIPT (TipTap editor) ================= */

export const SCRIPT_TITLE = "The First Marathon";

export type ScriptPara = {
  id: string;
  text: string;
  note: string;
  score: string;
  flagged?: boolean;
};

export const SCRIPT_PARAGRAPHS: ScriptPara[] = [
  {
    id: "p1",
    text: "Every marathon starts with a single step - hers came before the gun, on a quiet street at dawn. This is the story of 26.2 miles, and one first time.",
    note: "Hook lands in the first line - strong open. Consider a 4-second title card here.",
    score: "4.4",
  },
  {
    id: "p2",
    text: "The start line at 6 a.m. is all nerves and new shoes. Thousands of runners, but for her the distance is private: the wall at mile 20, the empty stretch where the race truly begins.",
    note: "Pacing is deliberate; the dash rhythm carries it. Trim \u201cnew shoes\u201d to cut 1.2s.",
    score: "4.2",
  },
  {
    id: "p3",
    text: "At the turnaround, two strangers share a laugh over a cup of water. It lasts four seconds and stays with her for the next ten miles - the race's quiet best part.",
    note: "Redundancy check: \u201cshare a laugh / cup of water\u201d overlaps p2's mile-20 imagery. Slight rewrite suggested.",
    score: "3.8",
    flagged: true,
  },
  {
    id: "p4",
    text: "The wall is real. By mile 20 the legs are done and the mind is loud - every song, every doubt, every reason to stop. Runners call it bonking; she calls it mile 20.",
    note: "Factual check passed - the mile-20 wall matches first-marathon literature.",
    score: "4.6",
  },
  {
    id: "p5",
    text: "Then the course turns toward the city and the crowd is a wall of sound. Strangers shout her name from the paper bib. She stops looking at the distance and starts looking at the line.",
    note: "The turn is the emotional peak - retention high here. No change.",
    score: "4.5",
  },
  {
    id: "p6",
    text: "Arms up at the line. The crowd answers. Every marathon is a first marathon - even hers.",
    note: "Close is two clauses long; the script reviewer suggests ending on \u201cthe crowd answers.\u201d",
    score: "4.0",
  },
];

/* ================= STUDIO HOME (launchpad) ================= */

export const PRODUCTION_MODES = ["Film", "Essay", "Explainer", "Ad"] as const;

/* ================= TAKE LOG ================= */

export type Take = {
  id: string;
  label: string;
  source: "AI" | "user";
  time: string;
  current?: boolean;
};

export const TAKES: Take[] = [
  { id: "t4", label: "v4", source: "user", time: "21:44", current: true },
  { id: "t3", label: "v3", source: "AI", time: "21:41" },
  { id: "t2", label: "v2", source: "AI", time: "21:35" },
  { id: "t1", label: "v1", source: "AI", time: "21:28" },
];

/* ================= ASSET TRAY ================= */

export type AssetKind = "image" | "video" | "voice" | "music" | "sfx";

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  status: "approved" | "draft" | "retake";
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  image: "IMG",
  video: "VID",
  voice: "VO",
  music: "MUS",
  sfx: "SFX",
};

export const STAGE_ASSETS: Record<number, Asset[]> = {
  4: [
    { id: "a1", name: "SC 01 still · The cold open", kind: "image", status: "approved" },
    { id: "a2", name: "SC 02 still · The moment", kind: "image", status: "approved" },
    { id: "a3", name: "SC 03 still · The finish", kind: "image", status: "draft" },
  ],
  5: [
    { id: "a4", name: "SC 03 keyframe", kind: "image", status: "approved" },
    { id: "a5", name: "SC 03 VO draft", kind: "voice", status: "draft" },
    { id: "a6", name: "SC 01 image prompt", kind: "image", status: "approved" },
    { id: "a7", name: "SC 01 music cue", kind: "music", status: "draft" },
    { id: "a8", name: "SC 03 SFX bed", kind: "sfx", status: "approved" },
    { id: "a9", name: "Cover still", kind: "image", status: "approved" },
    { id: "a10", name: "Narration master", kind: "voice", status: "approved" },
    { id: "a11", name: "Music bed · full", kind: "music", status: "approved" },
  ],
};

/* ================= DIRECTOR BAR SUGGESTIONS ================= */

export const DIRECTOR_SUGGESTIONS: string[] = [
  "Make scene 3 more dramatic",
  "Tighten the intro to 20s",
  "Use a warmer narrator",
  "Regenerate the title image with @start-line",
];

/* ================= HELPERS ================= */

export function formatTimecode(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type DemoState = "normal" | "loading" | "streaming" | "retake" | "empty";

export const DEMO_STATES: DemoState[] = ["normal", "loading", "streaming", "retake", "empty"];
