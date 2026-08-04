import type { Provider } from "../providers/types";
import { CharacterSchema, LocationSchema, type Brief, type ScriptContent } from "@videogen/shared";
import { system } from "./planning";

export async function characterAgent(provider: Provider, brief: Brief, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Character Agent. Extract stable characters from the script: id, name, description. Keep ids stable across revisions."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}` },
    ],
    schema: CharacterSchema.array(),
  });
  return res.output;
}

export async function environmentAgent(provider: Provider, brief: Brief, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Environment Agent. Extract stable locations from the script: id, name, description. Keep ids stable across revisions."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}` },
    ],
    schema: LocationSchema.array(),
  });
  return res.output;
}
