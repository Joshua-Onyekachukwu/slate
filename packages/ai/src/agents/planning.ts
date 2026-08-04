import { z } from "zod";
import type { Provider, ChatMessage } from "../providers/types";
import { BriefSchema } from "@slate/shared";

const PlanningOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("questions"), questions: z.array(z.string()).min(1).max(4) }),
  z.object({ kind: z.literal("brief"), brief: BriefSchema }),
]);

export async function planningAgent(provider: Provider, idea: string, conversation: ChatMessage[]): Promise<
  { kind: "questions"; questions: string[] } | { kind: "brief"; brief: z.infer<typeof BriefSchema> }
> {
  const sys = "You are the Planning Agent of an AI video studio. Interview the user minimally. " +
    "Ask only questions you cannot infer. When you have enough, emit a brief. Reply strictly as JSON: " +
    '{"kind":"questions","questions":[...]} or {"kind":"brief","brief":{...}} matching: ' +
    "topic, audience, platform, style, durationSeconds (int), tone, narration, aspectRatio.";
  const res = await provider.complete({
    messages: [system(sys), ...conversation, { role: "user", content: `Idea: ${idea}` }],
    schema: PlanningOutputSchema,
  });
  return res.output;
}

export function system(role: string): ChatMessage { return { role: "system", content: role }; }
