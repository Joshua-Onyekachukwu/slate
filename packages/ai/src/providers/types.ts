import type { ZodType } from "zod";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface Provider {
  readonly name: string;
  complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }>;
}

export type ProviderErrorCode = "RATE_LIMITED" | "PROVIDER_FAILURE" | "INVALID_OUTPUT";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) { super(message); this.name = "ProviderError"; }
}
