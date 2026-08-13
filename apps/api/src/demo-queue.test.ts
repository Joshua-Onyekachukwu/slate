import { describe, it, expect } from "vitest";
import { FakeProvider } from "@slate/ai";
import { createDemoQueue } from "./provider";

// The FakeProvider validates queued content against the caller's schema; a
// permissive object whose safeParse always succeeds is enough for queue-order
// assertions (apps/api has no zod dependency - only the workflow supplies real
// schemas).
const LOOSE = { safeParse: () => ({ success: true, data: null }) } as never;

// Drives the DEMO queue the way the workflow consumes it (one FIFO call per
// agent, in node order: planning → research → script → review → consistency →
// storyboard → editor → prompt×3) and asserts the SCRIPTED STORYBOARD-APPROVE
// path: project 1 ends at the storyboard gate, the user clicks Approve (which
// consumes NOTHING - a checkpoint-only move), and project 2 still starts on
// its OWN brief. That is the regression the old queue failed: it scripted a
// storyboard REJECT on project 1, so approving instead left the retake block
// in the FIFO and the next project consumed it as its BRIEF.
async function consume(provider: FakeProvider): Promise<unknown> {
  return (await provider.complete({ messages: [{ role: "user", content: "go" }], schema: LOOSE })).raw;
}

describe("demo queue - scripted storyboard approve path", () => {
  it("project 1: research → script retake → storyboard gate, and the approve that locks the plan costs nothing", async () => {
    const provider = new FakeProvider(createDemoQueue());

    // Create: planning (brief) + research agent → research gate.
    expect((JSON.parse(String(await consume(provider))) as { brief: { topic: string } }).brief.topic).toBe("A runner's first marathon");
    expect((JSON.parse(String(await consume(provider))) as { timeline: string[] }).timeline[0]).toContain("start line");

    // Research approved → script + low scores → script gate (2/5).
    expect((JSON.parse(String(await consume(provider))) as { title: string }).title).toBe("The First Marathon");
    expect((JSON.parse(String(await consume(provider))) as { overall: number }).overall).toBe(2);

    // Script REJECT → retake v2 + high scores → script gate (4/5).
    const v2 = JSON.parse(String(await consume(provider))) as { hook: string };
    expect(v2.hook).toContain("start gun");
    expect((JSON.parse(String(await consume(provider))) as { overall: number }).overall).toBe(4);

    // Script APPROVE → consistency (Maya, The Start Line) + storyboard pass →
    // storyboard gate v1 (plain titles + prompt packs).
    expect((JSON.parse(String(await consume(provider))) as { name: string }[])[0].name).toBe("Maya");
    expect((JSON.parse(String(await consume(provider))) as { name: string }[])[0].name).toBe("The Start Line");
    const scenes = JSON.parse(String(await consume(provider))) as { title: string }[];
    expect(scenes[0].title).toBe("The cold open");
    expect((JSON.parse(String(await consume(provider))) as { title: string }[])[0].title).toBe("The cold open"); // editor pass
    for (let i = 0; i < 3; i++) {
      expect((JSON.parse(String(await consume(provider))) as { imagePrompt: string }).imagePrompt).toContain("runner");
    }

    // Storyboard APPROVE consumes NOTHING - the NEXT project still starts on
    // its own BRIEF, never the leftover retake content (the desync regression).
    const p2First = JSON.parse(String(await consume(provider))) as { brief: { topic: string } };
    expect(p2First.brief.topic).toBe("A runner's first marathon");
  });

  it("project 2 scripts the storyboard retake so the reject demo still exists, then the trailing regenerate pack", async () => {
    const provider = new FakeProvider(createDemoQueue());
    // Burn project 1's journey (4 + 2 + 7 = 13 calls).
    for (let i = 0; i < 13; i++) await consume(provider);

    // Project 2: create → research gate (brief + research).
    await consume(provider);
    await consume(provider);
    // Approve research → script + scores 2/5.
    await consume(provider);
    await consume(provider);
    // Reject script → retake v2 + 4/5.
    await consume(provider);
    await consume(provider);
    // Approve script → consistency + storyboard v1.
    await consume(provider); // Maya
    await consume(provider); // The Start Line
    await consume(provider); // storyboardAgent
    await consume(provider); // editorAgent
    for (let i = 0; i < 3; i++) await consume(provider); // prompt packs

    // Storyboard REJECT → v2 retake ("(rev)" titles) + tighter packs.
    const rev = JSON.parse(String(await consume(provider))) as { title: string }[];
    expect(rev[0].title).toBe("The cold open (rev)");
    await consume(provider); // editor pass (rev)
    for (let i = 0; i < 3; i++) {
      expect((JSON.parse(String(await consume(provider))) as { imagePrompt: string }).imagePrompt).toContain("tighter framing");
    }

    // Trailing per-scene prompt regenerate.
    expect((JSON.parse(String(await consume(provider))) as { imagePrompt: string }).imagePrompt).toBe("Demo regenerated pack");
  });
});
