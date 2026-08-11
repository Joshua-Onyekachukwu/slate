import { createHash } from "node:crypto";
import type { Provider, ChatMessage, MediaArtifact } from "./types";
import type { ZodType } from "zod";

// Phase 3 Block 1 — media artifacts are DETERMINISTIC: the same prompt always
// yields the same fake URL (hash-stable), so tests and the demo can assert on
// exact URLs, and a retry with the same prompt is idempotent.
const art = (kind: string, ext: string, mime: string, seed: string): MediaArtifact => ({
  url: `fake://${kind}/${createHash("sha1").update(seed).digest("hex").slice(0, 12)}.${ext}`,
  mimeType: mime,
});

export class FakeProvider implements Provider {
  readonly name = "fake";
  private queue: { content: string }[];
  private _lastInput: { messages: ChatMessage[]; schema: ZodType<unknown> } | null = null;
  constructor(scripted: { content: string }[]) { this.queue = [...scripted]; }
  get lastInput() { return this._lastInput!; }
  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    this._lastInput = input as { messages: ChatMessage[]; schema: ZodType<unknown> };
    const next = this.queue.shift();
    if (!next) throw new Error("FakeProvider: no scripted response for call " + input.messages[input.messages.length - 1]?.content);
    const parsed = input.schema.safeParse(JSON.parse(next.content));
    if (!parsed.success) throw new Error("FakeProvider: scripted content failed schema: " + parsed.error.message);
    return { output: parsed.data, raw: next.content, route: "fake" };
  }
  async generateImage(input: { prompt: string; aspectRatio?: string }): Promise<MediaArtifact> {
    return art("image", "png", "image/png", input.prompt + (input.aspectRatio ?? ""));
  }
  async generateVideo(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    return art("video", "mp4", "video/mp4", input.prompt + (input.durationSeconds ?? 0));
  }
  async generateVoiceover(input: { text: string; style?: string }): Promise<MediaArtifact> {
    return art("voice", "mp3", "audio/mpeg", input.text + (input.style ?? ""));
  }
  async generateMusic(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    return art("music", "mp3", "audio/mpeg", input.prompt + (input.durationSeconds ?? 0));
  }
}
