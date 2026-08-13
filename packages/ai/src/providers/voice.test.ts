import { describe, it, expect } from "vitest";
import { createVoiceProvider } from "./voice";

// Narration backend selection (providers/voice.ts): ElevenLabs when a key is
// present, the zero-key composite (edge-tts → Windows SAPI) otherwise, with an
// explicit TTS_BACKEND override. The selection is pure - no synthesis is
// executed here (ElevenLabs would hit the network, edge-tts Microsoft's
// endpoint, SAPI the OS).
describe("createVoiceProvider", () => {
  it("selects elevenlabs when a key is present", () => {
    expect(createVoiceProvider({ elevenLabsApiKey: "k" }).name).toBe("elevenlabs");
  });

  it("selects the zero-key composite when no key is present", () => {
    // On Windows the composite adds the offline SAPI fallback tier.
    expect(createVoiceProvider({}).name).toBe(process.platform === "win32" ? "edge-tts+winsapi" : "edge-tts");
  });

  it("honors an explicit backend override", () => {
    expect(createVoiceProvider({ elevenLabsApiKey: "k", backend: "edge" }).name).toBe("edge-tts");
    expect(createVoiceProvider({ backend: "sapi" }).name).toBe("windows-sapi");
    expect(createVoiceProvider({ backend: "auto" }).name).toBe(process.platform === "win32" ? "edge-tts+winsapi" : "edge-tts");
  });

  it("throws a clear ProviderError when elevenlabs is forced without a key", async () => {
    const v = createVoiceProvider({ backend: "elevenlabs" });
    await expect(v.generateVoiceover({ text: "hi" })).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });
  });
});
