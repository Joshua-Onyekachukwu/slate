import type { ZodType } from "zod";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Phase 3 Block 1 — a generated media artifact. The provider returns a URL
// reference (CDN/hosted) rather than bytes so the abstraction stays model-
// agnostic and the API can persist it directly.
export interface MediaArtifact {
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface Provider {
  readonly name: string;
  complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }>;
  // Phase 3 Block 1 — per-scene media generation. Each method maps to one
  // AssetKind and consumes the matching prompt-pack field (see routes/assets).
  generateImage(input: { prompt: string; aspectRatio?: string }): Promise<MediaArtifact>;
  generateVideo(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact>;
  generateVoiceover(input: { text: string; style?: string }): Promise<MediaArtifact>;
  generateMusic(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact>;
}

export type ProviderErrorCode = "RATE_LIMITED" | "PROVIDER_FAILURE" | "INVALID_OUTPUT" | "NOT_SUPPORTED";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) { super(message); this.name = "ProviderError"; }
}

// A provider that does NOT implement a media capability yet — wired in later
// Phase 3 blocks against the real endpoint. The API persists a failed asset
// row keyed on this error, so callers see a typed, retryable failure.
export const notSupported = (provider: string, capability: string) =>
  new ProviderError("NOT_SUPPORTED", `${capability} not supported by ${provider} yet`);
