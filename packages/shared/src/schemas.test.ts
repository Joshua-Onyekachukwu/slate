import { describe, expect, it } from "vitest";
import { BriefSchema, ScriptContentSchema, SceneContentSchema, PromptPackSchema } from "./schemas";

describe("BriefSchema", () => {
  it("accepts a valid brief", () => {
    const brief = { topic: "History of the universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    expect(BriefSchema.safeParse(brief).success).toBe(true);
  });
  it("rejects a brief missing duration", () => {
    expect(BriefSchema.safeParse({ topic: "x", audience: "general" }).success).toBe(false);
  });
});

describe("ScriptContentSchema", () => {
  it("accepts a full script", () => {
    const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };
    expect(ScriptContentSchema.safeParse(script).success).toBe(true);
  });
});

describe("SceneContentSchema", () => {
  it("accepts a full scene", () => {
    const scene = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
    expect(SceneContentSchema.safeParse(scene).success).toBe(true);
  });
});

describe("PromptPackSchema", () => {
  it("accepts a pack with all five prompts", () => {
    const pack = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
    expect(PromptPackSchema.safeParse(pack).success).toBe(true);
  });
});
