import { describe, it, expect } from "vitest";
import { planningAgent } from "./planning";
import { FakeProvider } from "../providers/fake";

describe("planningAgent", () => {
  it("asks questions first, then produces a brief", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"questions","questions":["What platform?","How long?"]}' },
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
    ]);
    const first = await planningAgent(p, "doc about the universe", []);
    expect(first).toHaveProperty("questions");
    const second = await planningAgent(p, "doc about the universe", [{ role: "user", content: "youtube, 4:30" }]);
    expect(second).toHaveProperty("brief");
  });
});
