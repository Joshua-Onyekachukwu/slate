import { NvidiaProvider, FakeProvider, type Provider } from "@slate/ai";

const SCENE = (n: number) => ({
  title: `Scene ${n}`,
  narration: "13.8 billion years in one breath — and you are here.",
  visualDescription: "A single point of light blooming into expanding space.",
  cameraDirection: "Slow push-in from deep space",
  durationSeconds: 30 + n,
  transition: n % 2 ? "CUT" : "DISSOLVE",
  musicCue: n % 2 ? "Low drone" : "Strings enter",
});
const PACK = (n: number) => ({
  imagePrompt: `Still frame ${n}: point of light in pure black, photoreal, no text`,
  videoPrompt: `Camera push-in over ${30 + n}s at 24fps, no shake`,
  narrationPrompt: "Warm documentary register, hushed wonder, 140 wpm",
  musicPrompt: "Low drone, sub-bass swell, sparse",
  sfxPrompt: "Distant rumble, near-silence otherwise",
});
const SCENES = [SCENE(1), SCENE(2), SCENE(3)];
const REV_SCENES = SCENES.map((s) => ({ ...s, title: `${s.title} (rev)` }));
const RAW_PACKS = [PACK(1), PACK(2), PACK(3)];
// promptAgent is called ONCE PER SCENE — each queue entry is a single pack object.
const PACKS = RAW_PACKS.map((p) => ({ content: JSON.stringify(p) }));
const REV_PACKS = RAW_PACKS.map((p) => ({ content: JSON.stringify({ ...p, imagePrompt: `${p.imagePrompt} — tighter framing` }) }));

const BRIEF = '{"kind":"brief","brief":{"topic":"History of the universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const SCRIPT = '{"title":"The First Three Minutes","hook":"13.8 billion years in one breath.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}';
const SCRIPT_V2 = '{"title":"The First Three Minutes","hook":"Before the first light, there was an idea — and you are its echo.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}';
const SCORES_LOW = '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["needs a stronger hook"],"overall":2}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":["stronger hook now"],"overall":4}';

// A script-gate block: one project's journey to the script review gate.
const GATE_BLOCK = [
  { content: BRIEF }, { content: SCRIPT }, { content: SCORES_LOW },
];
// A storyboard block: approving that project's script consumes storyboardAgent,
// editorAgent, then promptAgent ×3 (one pack object per scene).
const STORY_BLOCK = (scenes: unknown[], packs: { content: string }[]) => [
  { content: JSON.stringify(scenes) }, // storyboardAgent
  { content: JSON.stringify(scenes) }, // editorAgent
  ...packs,                            // promptAgent ×3
];

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") {
    if (process.env.DEMO_QUEUE === "1") {
      // DEMO QUEUE (FAKE_PROVIDER=1 DEMO_QUEUE=1): adds a scripted retake so a
      // human can drive idea → script gate (2/5) → reject with feedback → v2
      // (4/5) → approve → storyboard gate → approve, without a 500. The reject
      // path loops write_script → review, consuming a script + scores pair.
      return new FakeProvider([
        ...GATE_BLOCK,                         // project 1 → script gate (reject here)
        { content: SCRIPT_V2 }, { content: SCORES_HIGH }, // retake: script v2 + 4/5 scores
        ...STORY_BLOCK(SCENES, PACKS),         // project 1 approved → storyboard gate
        ...GATE_BLOCK,                         // project 2 → script gate
        ...STORY_BLOCK(REV_SCENES, REV_PACKS), // project 2 approved → storyboard gate
      ]);
    }
    // E2E QUEUE (default): two (script-gate + storyboard) blocks — the E2E suite
    // runs two projects: the responsive viewport spec (stops at the storyboard
    // gate) and the vertical-slice spec (approves through to done). The queue is
    // FIFO and shared by every booted API, so Playwright must run with
    // workers: 1 to keep consumption deterministic (see tests/playwright.config.ts).
    return new FakeProvider([
      ...GATE_BLOCK,                    // project 1 → script gate
      ...STORY_BLOCK(SCENES, PACKS),    // project 1 script approved → storyboard gate
      ...GATE_BLOCK,                    // project 2 → script gate
      ...STORY_BLOCK(REV_SCENES, REV_PACKS), // project 2 script approved → storyboard gate
    ]);
  }
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is required when FAKE_PROVIDER != 1");
  return new NvidiaProvider({ apiKey, model: "nvidia/llama-3.3-70b" });
}
