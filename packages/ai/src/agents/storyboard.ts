import type { Provider } from "../providers/types";
import { SceneContentSchema, type ScriptContent, type Character, type Location } from "@slate/shared";
import { system } from "./planning";

export async function storyboardAgent(provider: Provider, script: ScriptContent, characters: Character[], locations: Location[], feedback?: string) {
  const res = await provider.complete({
    messages: [
      system("You are the Storyboard Agent. Convert the script into an ordered array of scenes. Each scene: title, narration, visualDescription, cameraDirection (cinematography), durationSeconds, transition, musicCue. Keep characters and locations consistent."),
      { role: "user", content: `Script: ${JSON.stringify(script)}\nCharacters: ${JSON.stringify(characters)}\nLocations: ${JSON.stringify(locations)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: SceneContentSchema.array().min(1), // an empty storyboard must never reach the gate
  });
  return res.output;
}
