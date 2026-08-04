import type { Provider } from "../providers/types";
import { PromptPackSchema, type SceneContent, type Character, type Location } from "@slate/shared";
import { system } from "./planning";

export async function promptAgent(provider: Provider, scene: SceneContent, characters: Character[], locations: Location[]) {
  const res = await provider.complete({
    messages: [
      system("You are the Prompt Agent. For one scene, produce optimized prompts: imagePrompt, videoPrompt, narrationPrompt, musicPrompt, sfxPrompt. Optimize for the downstream generation models; keep character/location consistency; carry the brief's tone and narration direction into the narration prompt."),
      { role: "user", content: `Scene: ${JSON.stringify(scene)}\nCharacters: ${JSON.stringify(characters)}\nLocations: ${JSON.stringify(locations)}` },
    ],
    schema: PromptPackSchema,
  });
  return res.output;
}
