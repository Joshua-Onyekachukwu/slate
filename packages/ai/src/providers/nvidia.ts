import type { Provider, ChatMessage } from "./types";
import { ProviderError } from "./types";
import type { ZodType } from "zod";

type NvidiaConfig = { apiKey: string; model: string; baseUrl?: string; maxRetries?: number };

export class NvidiaProvider implements Provider {
  readonly name = "nvidia";
  private cfg: Required<Omit<NvidiaConfig, "maxRetries">> & { maxRetries: number };
  constructor(cfg: NvidiaConfig) { this.cfg = { baseUrl: "https://integrate.api.nvidia.com/v1", maxRetries: 1, ...cfg }; }

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
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const parsed = input.schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        if (attempt >= maxRetries) throw new ProviderError("INVALID_OUTPUT", "output failed zod: " + parsed.error.message);
        attempt++; continue;
      }
      return { output: parsed.data, raw, route: `${model}@nvidia` };
    }
  }
}
