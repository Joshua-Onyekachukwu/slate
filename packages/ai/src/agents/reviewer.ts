import type { Provider } from "../providers/types";
import { ReviewScoresSchema, type ScriptContent } from "@videogen/shared";
import { system } from "./planning";

export async function reviewerAgent(provider: Provider, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Script Reviewer. Score 1-5: clarity, pacing, engagement, retention, redundancy. Provide notes (array of strings) and overall."),
      { role: "user", content: `Script: ${JSON.stringify(script)}` },
    ],
    schema: ReviewScoresSchema,
  });
  return res.output;
}
