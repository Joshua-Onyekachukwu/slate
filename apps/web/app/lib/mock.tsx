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
      <b>Discovery complete</b> — 3 clarifying questions answered. Approve to lock the creative
      brief.
    </>
  ),
  (
    <>
      <b>Brief ready</b> — topic, audience, style and runtime are set. Approve to begin research.
    </>
  ),
  (
    <>
      <b>Research packet ready</b> — timeline and sources compiled. Approve to move to the script.
    </>
  ),
  (
    <>
      <b>Script v3 scores 4.1</b> — above the 3.8 threshold. Approve to storyboard.
    </>
  ),
  (
    <>
      <b>6 scenes storyboarded</b> — drag to reorder, edit per scene. Approve to finalize scenes.
    </>
  ),
  (
    <>
      <b>Production ready</b> — scenes finalized, prompt packs set, crew sheet locked. Approve to
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
    title: "The History of the Universe",
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

export const SCENES: Scene[] = [
  {
    id: 1,
    title: "The Bang",
    durationSeconds: 42,
    transition: "CUT",
    meta: "Slow push-in · narration 00:38 · music: low drone",
    status: "Approved",
    tone: "default",
    narration:
      "Thirteen point eight billion years ago, all of it — every galaxy, every grain — was a point hotter than the sun's core.",
    visual:
      "A single point of light blooming into expanding space — pure black giving way to a glowing nebula.",
    camera: "Slow push-in from deep space",
    duration: "00:00:42",
    musicCue: "Low drone",
    prompts: {
      image:
        "A point of blinding white light at the center of pure black, expanding ring of energy, single frame, photoreal, no text.",
      video:
        "Static wide as a white point blooms and expands into a cooling nebula, 42s, 24fps, slow, no camera shake.",
      narration:
        "Female, warm documentary register. Pace 140 wpm, hushed wonder. 38s. Emphasis: \u201cforged inside a star\u201d.",
      music: "Low drone, sub-bass swell, sparse — no melody until the narration lands.",
      sfx: "Deep, distant rumble under the opening; near-silence otherwise.",
    },
  },
  {
    id: 2,
    title: "The First Stars",
    durationSeconds: 38,
    transition: "DISSOLVE",
    meta: "Whip-pan across dark hydrogen · strings enter",
    status: "Approved",
    tone: "default",
    narration: "Four hundred million years later, the first stars switched on in the dark.",
    visual:
      "Dark hydrogen clouds with stars flickering to life across the frame — small points of light through gas.",
    camera: "Whip-pan across the hydrogen sea",
    duration: "00:00:38",
    musicCue: "Strings enter",
    prompts: {
      image:
        "First stars igniting in dark hydrogen clouds, small points of light through gas, cinematic, 16:9.",
      video:
        "Whip-pan across dark hydrogen as stars flicker on, 38s, 24fps, warm tungsten key, no shake.",
      narration:
        "Female, warm. 142 wpm, steady wonder. 35s. Emphasis: \u201cswitched on in the dark\u201d.",
      music: "Strings enter softly, rising major — the first warmth of the piece.",
      sfx: "Soft crackle of ignition, almost subliminal.",
    },
  },
  {
    id: 3,
    title: "Galaxies Assemble",
    durationSeconds: 45,
    transition: "DISSOLVE",
    meta: "Orbital drift · timelapse feel · brass swell",
    status: "Approved",
    tone: "default",
    narration:
      "Four hundred million years after the Bang, gravity pulled the first gas into spinning cities of light.",
    visual:
      "Orbital drift over assembling galaxies — filaments of gas, then points of light switching on across a dark web.",
    camera: "Slow orbital drift, 5° tilt",
    duration: "00:00:45",
    musicCue: "Brass swell, low strings under narration",
    prompts: {
      image:
        "Filamentary galaxy web at z≈2, orbital camera drift, volumetric dust, warm tungsten key, 16:9, photoreal documentary grade — no text overlays.",
      video:
        "Slow orbital drift over assembling galaxies, 5° tilt, 45s, 24fps, depth-of-field pull from dust to light, no camera shake.",
      narration:
        "Female, warm documentary register. Pace 145 wpm, wonder + restraint. 38s. Emphasis: \u201ccities of light\u201d.",
      music: "Brass swell, low strings under narration.",
      sfx: "Low cosmic rumble, layered breath.",
    },
  },
  {
    id: 4,
    title: "Our Solar System",
    durationSeconds: 40,
    transition: "CUT",
    meta: "Tilt down from void to dust disk · piano",
    status: "Approved",
    tone: "default",
    narration:
      "Four point six billion years ago, our solar system condensed from a spinning disk of dust.",
    visual: "Tilt down from the void to a glowing dust disk with planets condensing in orbit.",
    camera: "Tilt down, 5°",
    duration: "00:00:40",
    musicCue: "Piano",
    prompts: {
      image:
        "A young solar system — dust disk tilting, planets condensing, single star at center, cinematic grade.",
      video:
        "Tilt down from void to a glowing dust disk, planets forming, 40s, 24fps, gentle drift.",
      narration:
        "Female, warm. 140 wpm, intimate. 37s. Emphasis: \u201ccondenses from a dust disk\u201d.",
      music: "Piano enters, single notes under narration.",
      sfx: "Wind-like hiss, planetary hum.",
    },
  },
  {
    id: 5,
    title: "Life Looks Back",
    durationSeconds: 38,
    transition: "DISSOLVE",
    meta: "Slow zoom to an eye, then sky · choir",
    status: "Approved",
    tone: "default",
    narration:
      "Chemistry became biology, biology became awareness — and awareness turned back toward the sky.",
    visual: "Macro on an eye reflecting stars, pulling out to the night sky.",
    camera: "Slow zoom, then tilt to sky",
    duration: "00:00:38",
    musicCue: "Choir",
    prompts: {
      image:
        "A human eye reflecting the night sky, macro, then the sky itself — wonder, photoreal.",
      video:
        "Slow zoom to an eye, then tilt to the sky, 38s, 24fps, shallow depth of field.",
      narration: "Female, warm. 143 wpm, awe. 36s. Emphasis: \u201ccame to know itself\u201d.",
      music: "Choir enters, hushed, resolving warmth.",
      sfx: "Heartbeat under the first half, fading to air.",
    },
  },
  {
    id: 6,
    title: "We Are Stardust",
    durationSeconds: 37,
    transition: "FADE",
    meta: "Static wide · narration resolves · fade to paper",
    status: "Retake — music overlap",
    tone: "rec",
    narration:
      "We are not observers of the cosmos. We are a part of it — the part that wonders.",
    visual: "Static wide starfield, one warm planet glowing, slow fade to paper white.",
    camera: "Static wide",
    duration: "00:00:37",
    musicCue: "Theme resolves, then fades",
    prompts: {
      image:
        "A wide starfield at rest, one warm planet glowing, minimal, documentary still.",
      video:
        "Static wide, narration resolves, slow fade to paper white, 37s, 24fps.",
      narration:
        "Female, warm. 138 wpm, final resolve. 34s. Emphasis: \u201cthe part that wonders\u201d.",
      music: "Full theme resolves, then fades to silence.",
      sfx: "Final inhale, held silence.",
    },
  },
];

/* ================= SCRIPT (TipTap editor) ================= */

export const SCRIPT_TITLE = "The First Three Minutes";

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
    text: "Every atom in your body was forged inside a star. Before that — nothing we can picture. This is the story of how the universe began, in the time it takes a kettle to boil.",
    note: "Hook lands in the first line — strong open. Consider a 4-second title card here.",
    score: "4.4",
  },
  {
    id: "p2",
    text: "Thirteen point eight billion years ago, all of it — every galaxy, every grain — was a point hotter than the sun's core. Then it expanded. Not an explosion into space: space itself stretching, cooling, becoming.",
    note: "Pacing is deliberate; the dash rhythm carries it. Trim \u201cevery grain\u201d to cut 1.2s.",
    score: "4.2",
  },
  {
    id: "p3",
    text: "For the first three minutes, the universe was a furnace. Hydrogen fused into helium. When it cooled enough, matter stopped annihilating and started assembling — stars, galaxies, planets, us.",
    note: "Redundancy check: \u201cfurnace / hydrogen fused\u201d overlaps p2's heat imagery. Slight rewrite suggested.",
    score: "3.8",
    flagged: true,
  },
  {
    id: "p4",
    text: "Four hundred million years later, the first stars switched on in the dark. Every heavy element in your coffee, your phone, your lungs — stardust, delivered by supernovae.",
    note: "Factual check passed — 400 Myr post-Bang matches Planck-era estimates.",
    score: "4.6",
  },
  {
    id: "p5",
    text: "On one rocky world, chemistry became biology, biology became awareness, and awareness turned back toward the sky. The universe, briefly, came to know itself.",
    note: "The turn is the emotional peak — retention high here. No change.",
    score: "4.5",
  },
  {
    id: "p6",
    text: "We are not observers of the cosmos. We are a part of it — the part that wonders.",
    note: "Close is two clauses long; the script reviewer suggests ending on \u201cthe part that wonders.\u201d",
    score: "4.0",
  },
];

/* ================= STUDIO HOME (launchpad) ================= */

export const PRODUCTION_MODES = ["Film", "Essay", "Explainer", "Ad"] as const;

export type RecentTake = {
  id: string;
  projectId: string;
  projectTitle: string;
  artifact: string;
  time: string;
  stage: number;
};

export const RECENT_TAKES: RecentTake[] = [
  {
    id: "rt1",
    projectId: "0042",
    projectTitle: "The History of the Universe",
    artifact: "Production plan v1 · 6 scenes",
    time: "21:58",
    stage: 5,
  },
  {
    id: "rt2",
    projectId: "0042",
    projectTitle: "The History of the Universe",
    artifact: "Script v3 · scored 4.1",
    time: "21:47",
    stage: 3,
  },
  {
    id: "rt3",
    projectId: "0041",
    projectTitle: "How Coffee Changed the World",
    artifact: "Storyboard v2 · 6 scenes",
    time: "19:12",
    stage: 4,
  },
  {
    id: "rt4",
    projectId: "0038",
    projectTitle: "Why Deep Sea Creatures Glow",
    artifact: "Research packet v1",
    time: "Aug 02",
    stage: 2,
  },
];

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
    { id: "a1", name: "SC 01 still · The Bang", kind: "image", status: "approved" },
    { id: "a2", name: "SC 02 still · First Stars", kind: "image", status: "approved" },
    { id: "a3", name: "SC 03 still · Galaxies", kind: "image", status: "draft" },
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
  "Regenerate the title image with @galaxy-web",
];

/* ================= HELPERS ================= */

export function formatTimecode(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type DemoState = "normal" | "loading" | "streaming" | "retake" | "empty";

export const DEMO_STATES: DemoState[] = ["normal", "loading", "streaming", "retake", "empty"];
