import { createHash } from "node:crypto";
import type { Provider, ChatMessage, MediaArtifact } from "./types";
import type { ZodType } from "zod";

// Phase 3 Block 1 - media artifacts are DETERMINISTIC: the same prompt always
// yields the same fake URL (hash-stable), so tests and the demo can assert on
// exact URLs, and a retry with the same prompt is idempotent.
// Phase 3 Block 2 - the quality score is derived from the SAME seed hash, so
// it is deterministic too: same prompt → same score, retry is idempotent.
// The spread is 2–5 (never a 1, so a failed eval is a genuine failure, and
// never a perfect 5) - low scores (< 3) flag the asset for regeneration.
const art = (kind: string, ext: string, mime: string, seed: string, pick: string | null): MediaArtifact => {
  const hash = createHash("sha1").update(seed).digest("hex");
  const score = 2 + (parseInt(hash.slice(0, 2), 16) % 4);
  return {
    // A real media URL when the demo provides one (deterministic per prompt,
    // still hash-stable), otherwise the fake:// reference the API persists for
    // tests and the E2E queue.
    url: pick ?? `fake://${kind}/${hash.slice(0, 12)}.${ext}`,
    mimeType: mime,
    quality: {
      score,
      notes: score < 3
        ? ["low prompt adherence - consider regenerating"]
        : ["on-brief - matches the prompt pack"],
    },
  };
};

// Demo media map: real asset URLs handed out by kind, picked deterministically
// from the prompt hash so the same prompt always resolves to the same file (and
// a retry is idempotent). Omit it entirely and every artifact stays a fake://
// reference - the E2E queue and unit tests keep that default.
export type FakeMedia = {
  image?: string[];
  video?: string[];
  voice?: string[];
  music?: string[];
};

export class FakeProvider implements Provider {
  readonly name = "fake";
  private queue: { content: string }[];
  private media: FakeMedia;
  private _lastInput: { messages: ChatMessage[]; schema: ZodType<unknown> } | null = null;
  constructor(scripted: { content: string }[], media: FakeMedia = {}) {
    this.queue = [...scripted];
    this.media = media;
  }
  get lastInput() { return this._lastInput!; }

  private pick(kind: keyof FakeMedia, seed: string): string | null {
    const list = this.media[kind];
    if (!list || list.length === 0) return null;
    const hash = createHash("sha1").update(seed).digest("hex");
    return list[parseInt(hash.slice(0, 8), 16) % list.length] ?? null;
  }
  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    this._lastInput = input as { messages: ChatMessage[]; schema: ZodType<unknown> };
    const next = this.queue.shift();
    if (!next) throw new Error("FakeProvider: no scripted response for call " + input.messages[input.messages.length - 1]?.content);
    const parsed = input.schema.safeParse(JSON.parse(next.content));
    if (!parsed.success) throw new Error("FakeProvider: scripted content failed schema: " + parsed.error.message);
    return { output: parsed.data, raw: next.content, route: "fake" };
  }
  async generateImage(input: { prompt: string; aspectRatio?: string }): Promise<MediaArtifact> {
    const seed = input.prompt + (input.aspectRatio ?? "");
    return art("image", "png", "image/png", seed, this.pick("image", seed));
  }
  async generateVideo(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    const seed = input.prompt + (input.durationSeconds ?? 0);
    return art("video", "mp4", "video/mp4", seed, this.pick("video", seed));
  }
  async generateVoiceover(input: { text: string; style?: string }): Promise<MediaArtifact> {
    const seed = input.text + (input.style ?? "");
    return art("voice", "mp3", "audio/mpeg", seed, this.pick("voice", seed));
  }
  async generateMusic(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    const seed = input.prompt + (input.durationSeconds ?? 0);
    return art("music", "mp3", "audio/mpeg", seed, this.pick("music", seed));
  }
}
