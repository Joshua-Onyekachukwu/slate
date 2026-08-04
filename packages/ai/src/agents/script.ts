import type { Provider } from "../providers/types";
import { ScriptContentSchema, type Brief } from "@videogen/shared";
import { system } from "./planning";

export async function scriptAgent(provider: Provider, brief: Brief, feedback?: string) {
  const res = await provider.complete({
    messages: [
      system("You are the Script Agent. Write a video script: title, hook, introduction, body (array of paragraphs), conclusion, cta (nullable)."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: ScriptContentSchema,
  });
  return res.output;
}
