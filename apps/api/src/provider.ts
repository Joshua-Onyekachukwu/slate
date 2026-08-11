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

const RESEARCH = '{"timeline":["13.8 bya: Big Bang","4.5 bya: Earth forms"],"concepts":["cosmic inflation"],"terminology":{"redshift":"light stretched by expansion"},"references":["NASA","ESA"],"keyEvents":["First stars ignite","Galaxies assemble"]}';
const BRIEF = '{"kind":"brief","brief":{"topic":"History of the universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const SCRIPT = '{"title":"The First Three Minutes","hook":"13.8 billion years in one breath.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}';
const SCRIPT_V2 = '{"title":"The First Three Minutes","hook":"Before the first light, there was an idea — and you are its echo.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}';
const SCORES_LOW = '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["needs a stronger hook"],"overall":2}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":["stronger hook now"],"overall":4}';
const CHARACTERS = '[{"id":"char-1","name":"The Narrator","description":"A calm voice guiding the journey"}]';
const LOCATIONS = '[{"id":"loc-1","name":"The Observable Universe","description":"Vast and dark"}]';

// A script-gate block: one project's journey to the SCRIPT review gate. Since
// Block 2 the journey passes the research gate first: brief → researchAgent
// (packet) → research gate (approved) → script → scores.
const GATE_BLOCK = [
  { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_LOW },
];
// A script APPROVE consumes consistency (characterAgent + environmentAgent)
// THEN the storyboard pass — so a full approve = CONSISTENCY + STORY_BLOCK.
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

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") {
    if (process.env.DEMO_QUEUE === "1") {
      // DEMO QUEUE (FAKE_PROVIDER=1 DEMO_QUEUE=1): scripted retakes for all
      // three gates (research, script, storyboard) so a human can drive idea →
      // research gate → approve → script gate (2/5) → reject → v2 (4/5) →
      // approve → storyboard gate → REJECT with feedback → storyboard v2
      // ((rev) titles) → approve, without a 500. GATE_BLOCK now includes the
      // RESEARCH entry (brief → researchAgent → research gate), so each project
      // journey pauses at the research gate first. The script reject loops
      // write_script → review (script + scores); the storyboard reject loops
      // write_storyboard → prompt_gen (another full STORY_BLOCK). The trailing
      // pack entry lets a human drive the per-scene prompt regeneration once
      // (POST .../prompts/regenerate consumes one promptAgent call).
      return new FakeProvider([
        ...GATE_BLOCK,                         // project 1 → research gate (approve) → script gate (reject here)
        { content: SCRIPT_V2 }, { content: SCORES_HIGH }, // script retake: v2 + 4/5 scores
        ...APPROVE_BLOCK(SCENES, PACKS),       // script approved → consistency + storyboard gate (v1, plain titles)
        ...STORY_BLOCK(REV_SCENES, REV_PACKS), // storyboard REJECT → gate v2 ("(rev)" titles)
        ...GATE_BLOCK,                         // project 2 → script gate (2/5)
        { content: SCRIPT_V2 }, { content: SCORES_HIGH }, // project 2 script retake: v2 + 4/5 scores
        ...APPROVE_BLOCK(SCENES, PACKS),       // project 2 approved → consistency + storyboard gate
        { content: JSON.stringify({ ...PACK(1), imagePrompt: "Demo regenerated pack" }) }, // per-scene prompts/regenerate
      ]);
    }
    // E2E QUEUE (default): two projects — the responsive viewport spec (stops at
    // the storyboard gate) and the vertical-slice spec (drives research gate →
    // script gate → approve → storyboard v1 → reject → v2 → per-scene EDIT →
    // per-scene PROMPT REGENERATE → approve → done). Each journey now APPROVES
    // the research gate (Block 2), which costs one researchAgent call. Consumption:
    // responsive consumes GATE(4) + APPROVE(7) = 11; vertical-slice consumes
    // GATE(4) + APPROVE(7) + STORY_REV(5) + prompts/regenerate(1) = 17; total 28
    // — exact exhaustion.
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
  return new NvidiaProvider({ apiKey, model: "nvidia/llama-3.3-70b" });
}
