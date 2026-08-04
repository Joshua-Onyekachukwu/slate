import type { Provider } from "../providers/types";
import { ResearchPacketSchema, type Brief, type ResearchPacket } from "@slate/shared";
import { system } from "./planning";

export async function researchAgent(provider: Provider, brief: Brief, feedback?: string): Promise<ResearchPacket> {
  const res = await provider.complete({
    messages: [
      system("You are the Research Agent. Produce a factual research packet: timeline, concepts, terminology, references, keyEvents. Never invent; omit unverifiable claims."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: ResearchPacketSchema,
  });
  // complete() infers zod's input type (defaults optional); the parsed output has them applied.
  return res.output as ResearchPacket;
}
