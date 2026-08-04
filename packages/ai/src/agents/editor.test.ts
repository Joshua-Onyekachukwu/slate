import { describe, it, expect } from "vitest";
import { editorAgent } from "./editor";
import { FakeProvider } from "../providers/fake";

describe("editorAgent", () => {
  it("fills each scene's per-scene transition and music cue fields", async () => {
    const p = new FakeProvider([
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' },
    ]);
    const scenes = [{ title: "S1", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }];
    const edited = await editorAgent(p, scenes);
    expect(edited[0].transition).toBe("DISSOLVE");
    expect(edited[0].musicCue).toBe("strings swell");
  });
});
