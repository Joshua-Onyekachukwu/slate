import type { Provider, ChatMessage } from "./types";
import type { ZodType } from "zod";

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
}
