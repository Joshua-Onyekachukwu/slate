import type { Provider } from "../providers/types";
import { SceneContentSchema, type SceneContent } from "@videogen/shared";
import { system } from "./planning";

export async function editorAgent(provider: Provider, scenes: SceneContent[]) {
  const res = await provider.complete({
    messages: [
      system("You are the Editor Agent. For each scene, set the per-scene transition into the next shot and the music cue only — no cross-scene plan."),
      { role: "user", content: `Scenes: ${JSON.stringify(scenes)}` },
    ],
    schema: SceneContentSchema.array(),
  });
  return res.output;
}
