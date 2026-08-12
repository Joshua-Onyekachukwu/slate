import type { Provider, ChatMessage, MediaArtifact, MediaQuality } from "./types";
import { ProviderError, notSupported } from "./types";
import { z, type ZodType } from "zod";

// Phase 3 Block 3 — real NVIDIA media endpoints. Only the capabilities NVIDIA
// Build verifiably hosts on its OpenAI-compatible HTTP surface are wired:
// image generation (`POST /images/generations` — the documented NIM contract)
// plus a REAL quality eval for images: the generated image is sent back to a
// hosted vision-language model which scores prompt adherence + visual quality
// (the Block 2 gate becomes a genuine eval instead of a placeholder).
//
// Video / voiceover / music stay typed NOT_SUPPORTED on purpose: NVIDIA's TTS
// (Nemotron Speech) is a gRPC service (grpc.nvcf.nvidia.com:443) behind access
// approval, and no OpenAI-compatible video or music generation endpoint on
// Build is verifiable — wiring unverified contracts would be a defect, so
// those capabilities keep the explicit NOT_SUPPORTED error the API persists.
//
// Block 1 note: the artifact URL is a `data:` URI when the API returns
// b64_json (the default) — self-contained and correct, but heavy; object
// storage upload (R2) is the follow-on for production.

type NvidiaConfig = {
  apiKey: string; model: string; baseUrl?: string; maxRetries?: number;
  // Block 3 media routing (all optional — defaults target NVIDIA Build).
  imageModel?: string; imageSize?: string;
  evalModel?: string; evalEnabled?: boolean;
};

const ASPECT_SIZES: Record<string, string> = {
  "1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280",
  "4:3": "1024x768", "3:4": "768x1024", "21:9": "1280x544",
};

const EVAL_SCHEMA = z.object({
  score: z.number().min(1).max(5),
  notes: z.array(z.string()),
});

type Json = Record<string, unknown>;

export class NvidiaProvider implements Provider {
  readonly name = "nvidia";
  private cfg: Required<Omit<NvidiaConfig, "maxRetries" | "imageModel" | "imageSize" | "evalModel" | "evalEnabled">> & {
    maxRetries: number; imageModel: string; imageSize: string; evalModel: string; evalEnabled: boolean;
  };
  constructor(cfg: NvidiaConfig) {
    this.cfg = {
      baseUrl: "https://integrate.api.nvidia.com/v1", maxRetries: 1,
      imageModel: "stabilityai/stable-diffusion-3.5-large", imageSize: "1024x1024",
      evalModel: "meta/llama-3.2-90b-vision-instruct", evalEnabled: true,
      ...cfg,
    };
  }

  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    const { apiKey, model, baseUrl, maxRetries } = this.cfg;
    const body = { model, messages: input.messages, temperature: 0.7, response_format: { type: "json_object" } };
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
      } catch {
        if (attempt >= maxRetries) throw new ProviderError("PROVIDER_FAILURE", "network error");
        attempt++; continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new ProviderError("RATE_LIMITED", `provider returned ${res.status}`);
        attempt++;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
        continue;
      }
      if (!res.ok) throw new ProviderError("PROVIDER_FAILURE", `provider returned ${res.status}`);
      let raw = "";
      try {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        raw = data.choices?.[0]?.message?.content ?? "";
        const parsed = input.schema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new ProviderError("INVALID_OUTPUT", "output failed zod: " + parsed.error.message);
        return { output: parsed.data, raw, route: `${model}@nvidia` };
      } catch (e) {
        // Garbage 200 body (bad JSON / missing choices) must surface as a typed INVALID_OUTPUT
        // (spec: "garbage output → typed failure"), so fallbacks can key off the code.
        if (e instanceof ProviderError) throw e;
        if (attempt >= maxRetries) throw new ProviderError("INVALID_OUTPUT", "unparseable provider output: " + String(e));
        attempt++; continue;
      }
    }
  }

  // Shared POST with the same retry/typed-error semantics as complete(): 429/5xx
  // retry once with backoff → RATE_LIMITED, network errors retry → PROVIDER_FAILURE,
  // garbage 200 bodies retry → INVALID_OUTPUT.
  private async postJson(path: string, body: Json): Promise<Json> {
    const { apiKey, baseUrl, maxRetries } = this.cfg;
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
      } catch {
        if (attempt >= maxRetries) throw new ProviderError("PROVIDER_FAILURE", "network error");
        attempt++; continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new ProviderError("RATE_LIMITED", `provider returned ${res.status}`);
        attempt++;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
        continue;
      }
      if (!res.ok) throw new ProviderError("PROVIDER_FAILURE", `provider returned ${res.status}`);
      try { return (await res.json()) as Json; }
      catch (e) {
        if (attempt >= maxRetries) throw new ProviderError("INVALID_OUTPUT", "unparseable provider output: " + String(e));
        attempt++; continue;
      }
    }
  }

  // Real image generation via NVIDIA's OpenAI-compatible images surface, with a
  // REAL quality eval: the image goes back to a vision model that scores it.
  async generateImage(input: { prompt: string; aspectRatio?: string }): Promise<MediaArtifact> {
    const { imageModel, imageSize, evalModel, evalEnabled } = this.cfg;
    const size = (input.aspectRatio && ASPECT_SIZES[input.aspectRatio]) || imageSize;
    const data = await this.postJson("/images/generations", {
      model: imageModel, prompt: input.prompt, size,
    });
    const rows = (data.data as { b64_json?: unknown; url?: unknown }[] | undefined) ?? [];
    const row = rows[0];
    if (!row) throw new ProviderError("INVALID_OUTPUT", "images response had no data rows");
    const url = typeof row.url === "string" ? row.url
      : typeof row.b64_json === "string" ? `data:image/png;base64,${row.b64_json}`
      : null;
    if (!url) throw new ProviderError("INVALID_OUTPUT", "images response had neither url nor b64_json");
    const [w, h] = size.split("x").map((n) => parseInt(n, 10));
    const artifact: MediaArtifact = {
      url,
      // Stable Diffusion-class outputs are PNG; hosted URLs are assumed the same
      // (the CDN may serve jpeg, but mime is advisory for the persisted row).
      mimeType: "image/png",
      width: Number.isFinite(w) ? w : undefined,
      height: Number.isFinite(h) ? h : undefined,
    };
    if (evalEnabled) artifact.quality = await this.evalImage(input.prompt, url);
    return artifact;
  }

  // The real quality gate: ask a hosted vision-language model to score the
  // generated image against its prompt (1–5 + notes). A failed eval NEVER fails
  // the generation or fabricates a score — the artifact just carries no quality
  // and the UI shows it without a chip (the API persists quality: null).
  private async evalImage(prompt: string, imageUrl: string): Promise<MediaQuality | undefined> {
    try {
      const data = await this.postJson("/chat/completions", {
        model: this.cfg.evalModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `You are a video-production quality editor. Rate how well this image matches its creative prompt, 1 (fails the brief) to 5 (perfect). Respond ONLY with JSON: {"score": <int 1-5>, "notes": ["<short reason>"]}.\nPrompt: ${prompt}` },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
      });
      const content = (data.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? "";
      const parsed = EVAL_SCHEMA.safeParse(JSON.parse(content));
      if (!parsed.success) return undefined;
      return { score: Math.min(5, Math.max(1, Math.round(parsed.data.score))), notes: parsed.data.notes };
    } catch {
      return undefined;
    }
  }
  async generateVideo(_input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    throw notSupported(this.name, "video generation");
  }
  async generateVoiceover(_input: { text: string; style?: string }): Promise<MediaArtifact> {
    throw notSupported(this.name, "voiceover generation");
  }
  async generateMusic(_input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    throw notSupported(this.name, "music generation");
  }
}
