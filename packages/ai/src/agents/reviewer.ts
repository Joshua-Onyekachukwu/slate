import type { Provider } from "../providers/types";
import { ReviewScoresSchema, type ScriptContent, type ReviewScores } from "@videogen/shared";
import { system } from "./planning";

export async function reviewerAgent(provider: Provider, script: ScriptContent): Promise<ReviewScores> {
  const res = await provider.complete({
    messages: [
      system("You are the Script Reviewer. Score 1-5: clarity, pacing, engagement, retention, redundancy. Provide notes (array of strings) and overall."),
      { role: "user", content: `Script: ${JSON.stringify(script)}` },
    ],
    schema: ReviewScoresSchema,
  });
  // complete() infers zod's input type (notes default optional); parsed output has it applied.
  return res.output as ReviewScores;
}
