import { NvidiaProvider, FakeProvider, type Provider } from "@slate/ai";

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") {
    // Scripted sequence matching the E2E flow: brief → script → high scores.
    // Scripted sequence: pass 1 (brief → script → low scores), pass 2 after a
    // regenerate (script → high scores) — so both the approve and regenerate
    // paths are smoke-testable. The happy path (approve) consumes only 3.
    return new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"History of the universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"The First Three Minutes","hook":"13.8 billion years in one breath.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}' },
      { content: '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["needs a stronger hook"],"overall":2}' },
      { content: '{"title":"The First Three Minutes (rev)","hook":"13.8 billion years in one breath — and you are here.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]);
  }
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is required when FAKE_PROVIDER != 1");
  return new NvidiaProvider({ apiKey, model: "nvidia/llama-3.3-70b" });
}
