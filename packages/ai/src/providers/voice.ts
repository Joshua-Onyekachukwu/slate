import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderError, type MediaArtifact } from "./types";

// Narration synthesis - the voiceover track of the exported film. NVIDIA Build
// has no hosted TTS API (gRPC, approval-gated), so the film gets its voice from
// a dedicated backend, selected by env at createVoiceProvider():
//
//   - ElevenLabs (ELEVENLABS_API_KEY): production-grade voices. POST
//     /v1/text-to-speech/{voice} returns raw mp3 bytes → a self-contained
//     data: URI (the renderer materializes data: URIs directly).
//   - edge-tts fallback (no key): Microsoft Edge's online TTS via websocket -
//     zero-key narration so the demo film carries a real voice track TODAY.
//     NOTE: the edge-tts npm library is CC BY-NC-SA licensed - fine for
//     development and demo, but swap in a keyed backend for commercial use.
//
// The artifact shape matches the Provider.generateVoiceover contract, so the
// assets route and the render's auto-narration treat it like any media source.

export interface VoiceSynth {
  readonly name: string;
  generateVoiceover(input: { text: string; style?: string }): Promise<MediaArtifact>;
}

export interface VoiceConfig {
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  edgeVoice?: string;
  sapiVoice?: string;
  // Explicit backend: "elevenlabs" | "edge" | "sapi". Default: elevenlabs
  // when a key is present, else the zero-key composite (edge-tts with a
  // Windows SAPI fallback) so narration always works.
  backend?: string;
}

const DEFAULT_ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" - warm, clear
const DEFAULT_ELEVEN_MODEL = "eleven_multilingual_v2";
const DEFAULT_EDGE_VOICE = "en-US-AvaMultilingualNeural"; // warm female documentary voice

const toDataUri = (bytes: Uint8Array) => `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;

function elevenLabsSynth(cfg: VoiceConfig): VoiceSynth {
  const apiKey = cfg.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY;
  const voiceId = cfg.elevenLabsVoiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVEN_VOICE;
  const modelId = cfg.elevenLabsModelId ?? process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVEN_MODEL;
  return {
    name: "elevenlabs",
    async generateVoiceover({ text }) {
      if (!apiKey) throw new ProviderError("PROVIDER_FAILURE", "ELEVENLABS_API_KEY is not set");
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.55, similarity_boost: 0.7, style: 0.2 },
        }),
      });
      if (!res.ok) throw new ProviderError("PROVIDER_FAILURE", `elevenlabs returned ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) throw new ProviderError("INVALID_OUTPUT", "elevenlabs returned empty audio");
      return { url: toDataUri(bytes), mimeType: "audio/mpeg" };
    },
  };
}

function edgeSynth(cfg: VoiceConfig): VoiceSynth {
  const voice = cfg.edgeVoice ?? process.env.EDGE_TTS_VOICE ?? DEFAULT_EDGE_VOICE;
  return {
    name: "edge-tts",
    async generateVoiceover({ text }) {
      // Dynamic import: the package ships TS sources (main = index.ts); the
      // compiled ESM artifact + its types live in out/ and are part of the
      // published files, so this resolves under both tsx and tsc.
      try {
        const mod = await import("edge-tts/out/index.js");
        const buf: Buffer = await mod.tts(text, { voice });
        if (!buf || buf.length === 0) throw new ProviderError("INVALID_OUTPUT", "edge-tts returned empty audio");
        return { url: toDataUri(new Uint8Array(buf)), mimeType: "audio/mpeg" };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError("PROVIDER_FAILURE", `edge-tts failed: ${(e as Error).message}`);
      }
    },
  };
}

// Windows-only zero-key tier: the OS speech synthesizer (Microsoft David /
// Zira, SAPI5). No network, no key - works offline, verified on this machine.
// Quality is dated compared to ElevenLabs, but it guarantees the film always
// carries narration. Text goes through a temp file (no quoting hazards); the
// spoken WAV comes back as a data: URI.
function sapiSynth(cfg: VoiceConfig): VoiceSynth {
  const voice = cfg.sapiVoice ?? process.env.SAPI_VOICE ?? "Microsoft Zira Desktop";
  return {
    name: "windows-sapi",
    async generateVoiceover({ text }) {
      const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const textFile = join(tmpdir(), `slate-tts-${tag}.txt`);
      const wavFile = join(tmpdir(), `slate-tts-${tag}.wav`);
      writeFileSync(textFile, text, "utf8");
      try {
        const script = [
          "Add-Type -AssemblyName System.Speech",
          "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
          `try { $s.SelectVoice('${voice.replace(/'/g, "''")}') } catch {}`,
          `$s.SetOutputToWaveFile('${wavFile.replace(/'/g, "''")}')`,
          `$s.Speak((Get-Content -Raw '${textFile.replace(/'/g, "''")}'))`,
          "$s.Dispose()",
        ].join("; ");
        const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
          encoding: "utf8", timeout: 60_000, windowsHide: true,
        });
        if (r.status !== 0) {
          throw new ProviderError("PROVIDER_FAILURE", `windows sapi exited ${r.status}: ${(r.stderr ?? "").slice(0, 200)}`);
        }
        const bytes = readFileSync(wavFile);
        if (!bytes.length) throw new ProviderError("INVALID_OUTPUT", "windows sapi returned empty audio");
        return { url: `data:audio/wav;base64,${bytes.toString("base64")}`, mimeType: "audio/wav" };
      } finally {
        try { unlinkSync(textFile); } catch { /* best-effort */ }
        try { unlinkSync(wavFile); } catch { /* best-effort */ }
      }
    },
  };
}

// Zero-key composite: edge-tts first (nice voice, needs Microsoft's network
// endpoint), Windows SAPI as an offline fallback when edge is unreachable/
// blocked - narration never silently fails on a keyless machine.
function zeroKeySynth(cfg: VoiceConfig): VoiceSynth {
  const edge = edgeSynth(cfg);
  if (process.platform !== "win32") return edge;
  const sapi = sapiSynth(cfg);
  return {
    name: "edge-tts+winsapi",
    async generateVoiceover(input) {
      try {
        return await edge.generateVoiceover(input);
      } catch (e) {
        if (e instanceof ProviderError) {
          console.warn(`[voice] edge-tts failed (${e.message}) - falling back to Windows SAPI`);
        }
        return sapi.generateVoiceover(input);
      }
    },
  };
}

// Env-selected backend. Default: ElevenLabs when a key is present, else the
// zero-key composite so narration always works. TTS_BACKEND overrides
// explicitly. Config injectable for tests.
export function createVoiceProvider(cfg: VoiceConfig = {}): VoiceSynth {
  const key = cfg.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY;
  const backend = cfg.backend ?? process.env.TTS_BACKEND ?? (key ? "elevenlabs" : "auto");
  if (backend === "elevenlabs") return elevenLabsSynth(cfg);
  if (backend === "edge") return edgeSynth(cfg);
  if (backend === "sapi") return sapiSynth(cfg);
  return key ? elevenLabsSynth(cfg) : zeroKeySynth(cfg); // "auto"
}
