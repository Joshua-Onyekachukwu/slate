import { NvidiaProvider, FakeProvider, type Provider, type FakeMedia } from "@slate/ai";

// The demo film - the SAME story the landing page showcases: a documentary
// about a runner's first marathon. The scripted scenes mirror the landing's
// three-shot contact sheet (cold open / the moment / the finish), so the
// product demo and the marketing landing tell one coherent film.
const SCENES = [
  {
    title: "The cold open",
    narration: "First steps into an empty street at dawn - she smiles before the gun.",
    visualDescription: "A runner alone on an empty city street in morning light, breath visible in the cold air.",
    cameraDirection: "Slow push-in from a wide street",
    durationSeconds: 31,
    transition: "CUT",
    musicCue: "Low drone",
  },
  {
    title: "The moment",
    narration: "Two runners share a laugh at the turnaround - the race's quiet best part.",
    visualDescription: "Two runners side by side at the turnaround, laughing mid-stride.",
    cameraDirection: "Over-the-shoulder tracking shot",
    durationSeconds: 32,
    transition: "DISSOLVE",
    musicCue: "Strings enter",
  },
  {
    title: "The finish",
    narration: "Arms up at the line. The crowd answers.",
    visualDescription: "A runner crossing the finish line, arms raised, the crowd on its feet.",
    cameraDirection: "Wide crane-down over the finish line",
    durationSeconds: 33,
    transition: "CUT",
    musicCue: "Anthem swell",
  },
];
const REV_SCENES = SCENES.map((s) => ({ ...s, title: `${s.title} (rev)` }));
const PACK = (n: number) => ({
  imagePrompt: `Still frame ${n}: runner at dawn on an empty city street, photoreal, no text`,
  videoPrompt: `Camera tracking the runner over ${30 + n}s at 24fps, no shake`,
  narrationPrompt: "Warm documentary register, breath and effort, 140 wpm",
  musicPrompt: "Low drone, heartbeat pulse, sparse",
  sfxPrompt: "Distant crowd, footsteps, near-silence otherwise",
});
const RAW_PACKS = [PACK(1), PACK(2), PACK(3)];
// promptAgent is called ONCE PER SCENE - each queue entry is a single pack object.
const PACKS = RAW_PACKS.map((p) => ({ content: JSON.stringify(p) }));
const REV_PACKS = RAW_PACKS.map((p) => ({ content: JSON.stringify({ ...p, imagePrompt: `${p.imagePrompt} - tighter framing` }) }));

const RESEARCH = '{"timeline":["6:00 am: the start line","Mile 20: the wall","26.2: the finish"],"concepts":["the runner\'s high","the wall"],"terminology":{"bonk":"the wall - legs empty, mind loud"},"references":["Marathon training guides","First-race documentaries"],"keyEvents":["The start gun","The wall at mile 20","Crossing the line"]}';
const BRIEF = '{"kind":"brief","brief":{"topic":"A runner\'s first marathon","audience":"first-time runners","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"warm","narration":"female","aspectRatio":"16:9"}}';
const SCRIPT = '{"title":"The First Marathon","hook":"26.2 miles, and one first time.","introduction":"Every marathon starts with a single step - hers came before the gun, on a quiet street at dawn.","body":["The start.","The wall.","The finish."],"conclusion":"Every marathon is a first marathon.","cta":null}';
const SCRIPT_V2 = '{"title":"The First Marathon","hook":"Before the start gun, there was one idea - to finish.","introduction":"Every marathon starts with a single step - hers came before the gun, on a quiet street at dawn.","body":["The start.","The wall.","The finish."],"conclusion":"Every marathon is a first marathon.","cta":null}';
const SCORES_LOW = '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["needs a stronger hook"],"overall":2}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":["stronger hook now"],"overall":4}';
const CHARACTERS = '[{"id":"char-1","name":"Maya","description":"A first-time marathoner running her first 26.2"}]';
const LOCATIONS = '[{"id":"loc-1","name":"The Start Line","description":"City streets at dawn"}]';

// A script-gate block: one project's journey to the SCRIPT review gate. Since
// Block 2 the journey passes the research gate first: brief → researchAgent
// (packet) → research gate (approved) → script → scores.
const GATE_BLOCK = [
  { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_LOW },
];
// A script APPROVE consumes consistency (characterAgent + environmentAgent)
// THEN the storyboard pass - so a full approve = CONSISTENCY + STORY_BLOCK.
const CONSISTENCY = [
  { content: CHARACTERS }, // characterAgent
  { content: LOCATIONS },  // environmentAgent
];
// A storyboard pass: storyboardAgent, editorAgent, then promptAgent ×3 (one
// pack object per scene). Rejecting a storyboard re-consumes only this block
// (consistency does NOT re-run on a storyboard retake).
const STORY_BLOCK = (scenes: unknown[], packs: { content: string }[]) => [
  { content: JSON.stringify(scenes) }, // storyboardAgent
  { content: JSON.stringify(scenes) }, // editorAgent
  ...packs,                            // promptAgent ×3
];
const APPROVE_BLOCK = (scenes: unknown[], packs: { content: string }[]) => [...CONSISTENCY, ...STORY_BLOCK(scenes, packs)];

// Demo film assets: the runner imagery the landing showcases, served by the
// API's own /demo-media route so the renderer can download them. The demo's
// generated "assets" then point at REAL media - looped stills per scene plus
// the hero clip as a motion segment - so an idea renders to an actual
// watchable film, not title cards on a dark frame.
const DEMO_MEDIA_BASE = `http://localhost:${process.env.PORT ?? 4100}/demo-media`;
const DEMO_MEDIA: FakeMedia = {
  image: ["cold-open.jpg", "the-flash.jpg", "first-light.jpg"].map((f) => `${DEMO_MEDIA_BASE}/${f}`),
  video: [`${DEMO_MEDIA_BASE}/cold-open.mp4`],
};

// The demo queue scripts TWO projects. Project 1 is the hero journey and ends
// at the STORYBOARD GATE: the demo user clicks "Approve & continue" to lock
// the production plan (approving a gate consumes NOTHING - the checkpoint
// moves to done), then exports the film from the workspace. That is why the
// storyboard retake is NOT scripted on project 1's path: queuing it there
// would corrupt every later project if the user approved instead of rejected
// (the FIFO would hand the leftover retake to the next project's BRIEF).
// Project 2 scripts the storyboard REJECT → v2 retake so the retake demo
// still exists for a second demo project.
//
// Journey per project: research gate (approve) → script gate 2/5 → reject →
// v2 4/5 → approve → consistency + storyboard gate. GATE_BLOCK includes the
// research entry (brief → researchAgent → research gate). The trailing pack
// entry lets a human drive the per-scene prompt regeneration once.
export function createDemoQueue(): { content: string }[] {
  return [
    ...GATE_BLOCK,                         // project 1 → research gate → script gate (reject here)
    { content: SCRIPT_V2 }, { content: SCORES_HIGH }, // script retake: v2 + 4/5 scores
    ...APPROVE_BLOCK(SCENES, PACKS),       // script approved → consistency + storyboard gate v1 → user approves → done
    ...GATE_BLOCK,                         // project 2 → research gate → script gate (2/5)
    { content: SCRIPT_V2 }, { content: SCORES_HIGH }, // project 2 script retake: v2 + 4/5 scores
    ...APPROVE_BLOCK(SCENES, PACKS),       // project 2 approved → consistency + storyboard gate v1
    ...STORY_BLOCK(REV_SCENES, REV_PACKS), // project 2 storyboard REJECT → gate v2 ("(rev)" titles)
    { content: JSON.stringify({ ...PACK(1), imagePrompt: "Demo regenerated pack" }) }, // per-scene prompts/regenerate
  ];
}

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") {
    if (process.env.DEMO_QUEUE === "1") {
      // Media URLs point at the API's own /demo-media files, so a demo render
      // downloads REAL stills + motion footage and assembles an actual film.
      return new FakeProvider(createDemoQueue(), DEMO_MEDIA);
    }
    // E2E QUEUE (default): two projects - the responsive viewport spec (stops at
    // the storyboard gate) and the vertical-slice spec (drives research gate →
    // script gate → approve → storyboard v1 → reject → v2 → per-scene EDIT →
    // per-scene PROMPT REGENERATE → approve → done). Each journey now APPROVES
    // the research gate (Block 2), which costs one researchAgent call. Consumption:
    // responsive consumes GATE(4) + APPROVE(7) = 11; vertical-slice consumes
    // GATE(4) + APPROVE(7) + STORY_REV(5) + prompts/regenerate(1) = 17; total 28
    // - exact exhaustion.
    // The queue is FIFO and shared by every booted API, so Playwright must run
    // with workers: 1 to keep consumption deterministic (see tests/playwright.config.ts).
    return new FakeProvider([
      ...GATE_BLOCK,                    // project 1 → script gate
      ...APPROVE_BLOCK(SCENES, PACKS),  // project 1 script approved → consistency + storyboard gate
      ...GATE_BLOCK,                    // project 2 → script gate
      ...APPROVE_BLOCK(SCENES, PACKS),  // project 2 script approved → consistency + storyboard gate v1
      ...STORY_BLOCK(REV_SCENES, REV_PACKS), // project 2 storyboard REJECT → gate v2
      { content: JSON.stringify({ ...PACK(1), imagePrompt: "Regenerated pack for scene 1" }) }, // per-scene prompts/regenerate
    ]);
  }
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is required when FAKE_PROVIDER != 1");
  // Phase 3 Block 3 - real media endpoints. Image generation + the vision-model
  // quality eval are env-routed; video/voice/music stay NOT_SUPPORTED (NVIDIA's
  // TTS is gRPC/approval-gated, no verifiable video/music HTTP surface).
  return new NvidiaProvider({
    apiKey,
    model: process.env.NVIDIA_MODEL ?? "nvidia/llama-3.3-70b",
    imageModel: process.env.NVIDIA_IMAGE_MODEL ?? "stabilityai/stable-diffusion-3.5-large",
    evalModel: process.env.NVIDIA_EVAL_MODEL ?? "meta/llama-3.2-90b-vision-instruct",
    evalEnabled: process.env.NVIDIA_IMAGE_EVAL !== "0",
    // Optional self-hosted NVIDIA NIM text-to-video (Wan/CogVideoX/Kling).
    // NVIDIA Build has no hosted video endpoint, so this stays unset by
    // default and generateVideo returns NOT_SUPPORTED; point both vars at a
    // running NIM to generate per-scene video assets.
    videoModel: process.env.NVIDIA_VIDEO_MODEL,
    videoEndpoint: process.env.NVIDIA_VIDEO_ENDPOINT,
  });
}
