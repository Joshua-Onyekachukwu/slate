import type { Provider, ChatMessage, MediaArtifact, MediaQuality } from "./types";
import { ProviderError, notSupported } from "./types";
import { z, type ZodType } from "zod";

// Phase 3 Block 3 - real NVIDIA media endpoints. Only the capabilities NVIDIA
// Build verifiably hosts on its OpenAI-compatible HTTP surface are wired:
// image generation (`POST /images/generations` - the documented NIM contract)
// plus a REAL quality eval for images: the generated image is sent back to a
// hosted vision-language model which scores prompt adherence + visual quality
// (the Block 2 gate becomes a genuine eval instead of a placeholder).
//
// Video / voiceover / music: NVIDIA Build has NO hosted, verifiable OpenAI-
// compatible endpoint for any of them, so all three stay NOT_SUPPORTED on the
// Build defaults (NVIDIA's TTS is a gRPC service behind access approval;
// fabricated contracts would be defects). VIDEO is the one exception worth a
// configurable path: NVIDIA NIM video models (Wan / CogVideoX / Kling) expose
// an OpenAI-style text-to-video contract when SELF-HOSTED - POST
// /videos/generations → {id}, GET /videos/{id} until done. Set NVIDIA_VIDEO_MODEL
// + NVIDIA_VIDEO_ENDPOINT to point at such a NIM and generateVideo runs; unset,
// it keeps the explicit NOT_SUPPORTED error the API persists.
//
// Block 1 note: the artifact URL is a `data:` URI when the API returns
// b64_json (the default) - self-contained and correct, but heavy; object
// storage upload (R2) is the follow-on for production.

type NvidiaConfig = {
  apiKey: string; model: string; baseUrl?: string; maxRetries?: number;
  // Block 3 media routing (all optional - defaults target NVIDIA Build).
  imageModel?: string; imageSize?: string;
  evalModel?: string; evalEnabled?: boolean;
  // Optional self-hosted NVIDIA NIM text-to-video endpoint (see above).
  videoModel?: string; videoEndpoint?: string; videoPollMs?: number;
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
  private cfg: Required<Omit<NvidiaConfig, "maxRetries" | "imageModel" | "imageSize" | "evalModel" | "evalEnabled" | "videoModel" | "videoEndpoint" | "videoPollMs">> & {
    maxRetries: number; imageModel: string; imageSize: string; evalModel: string; evalEnabled: boolean;
    videoModel?: string; videoEndpoint?: string; videoPollMs?: number;
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
  private async postJson(path: string, body: Json, base?: string): Promise<Json> {
    const { apiKey, baseUrl, maxRetries } = this.cfg;
    const origin = base ?? baseUrl;
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${origin}${path}`, {
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

  // GET with the same retry/typed-error semantics as postJson (used by the
  // video-generation status poll).
  private async getJson(path: string, base?: string): Promise<Json> {
    const { apiKey, baseUrl, maxRetries } = this.cfg;
    const origin = base ?? baseUrl;
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${origin}${path}`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
  // the generation or fabricates a score - the artifact just carries no quality
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
  // Text-to-video against a SELF-HOSTED NVIDIA NIM (Wan / CogVideoX / Kling)
  // exposing the OpenAI-style contract: POST /videos/generations → { id }, then
  // GET /videos/{id} until done (generation can take minutes - poll every 5s,
  // up to 5 minutes). Response shapes vary by NIM, so status + URL extraction
  // tolerates the common variants; failures surface as typed ProviderErrors.
  // Unconfigured (no NVIDIA_VIDEO_ENDPOINT) → NOT_SUPPORTED, the persisted,
  // retryable error the API expects for capabilities a deployment lacks.
  async generateVideo(input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    const { videoModel, videoEndpoint, videoPollMs } = this.cfg;
    if (!videoModel || !videoEndpoint) throw notSupported(this.name, "video generation");
    // The NIM endpoint may be a full base (…/v1) or the bare host; compose
    // from videoEndpoint when set, else the provider's baseUrl.
    const vBase = videoEndpoint.replace(/\/$/, "");
    const started = await this.postJson("/videos/generations", { model: videoModel, prompt: input.prompt }, vBase);
    const id = typeof started.id === "string" ? started.id
      : typeof started.video_id === "string" ? started.video_id
      : typeof (started.data as { id?: unknown } | undefined)?.id === "string" ? (started.data as { id: string }).id
      : "";
    if (!id) throw new ProviderError("INVALID_OUTPUT", "videos response had no id");

    const pollMs = videoPollMs ?? 5000;
    let url: string | null = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, pollMs));
      const status = await this.getJson(`/videos/${id}`, vBase);
      const st = String(status.status ?? status.state ?? (status.data as Json | undefined)?.status ?? "").toLowerCase();
      if (st === "failed" || st === "error") {
        throw new ProviderError("PROVIDER_FAILURE", `video generation failed for ${id}`);
      }
      if (st === "done" || st === "completed" || st === "succeeded" || st === "success") {
        const d = (status.data as Json | undefined) ?? status;
        const video = (d.video as Json | undefined) ?? d;
        const candidate = d.video_url ?? d.url ?? video.url ?? video.video_url ?? status.video_url ?? status.url;
        if (typeof candidate === "string" && candidate) { url = candidate; break; }
        // Marked done but no URL yet - a few NIMs finalize the row after the
        // status flips; give it one more short window before giving up.
        if (attempt >= 2) throw new ProviderError("INVALID_OUTPUT", "video done but no url in response");
        continue;
      }
    }
    if (!url) throw new ProviderError("RATE_LIMITED", `video generation for ${id} timed out after 5 minutes`);
    return { url, mimeType: "video/mp4" };
  }
  async generateVoiceover(_input: { text: string; style?: string }): Promise<MediaArtifact> {
    throw notSupported(this.name, "voiceover generation");
  }
  async generateMusic(_input: { prompt: string; durationSeconds?: number }): Promise<MediaArtifact> {
    throw notSupported(this.name, "music generation");
  }
}
