# AI Pipeline

> Status: **Draft** · Last updated: 2026-08-03 · Companion: `decisions.md` ADR-003 (LangGraph).

This is where the product becomes unique: making dozens of AI calls feel like **one coherent
creative process**.

## The nine stages

| Stage | Input | Output | Review gate? |
| --- | --- | --- | --- |
| 1. Creative Discovery | natural-language idea | **Creative Brief** (topic, audience, platform, style, duration, tone, narration, aspect ratio) | yes — user edits & approves brief |
| 2. Research | approved brief | research packet: timeline, concepts, terminology, references, key events | yes — user approves before scripting |
| 3. Script Writing | approved research | title, hook, introduction, body, conclusion, CTA | no — goes to review |
| 4. Script Review | draft script | scores + suggested revisions (clarity, pacing, engagement, retention, redundancy, factual consistency) | yes — automated gate; user approves/edits |
| 5. Storyboarding | approved script | structured scenes: narration, visual description, camera direction, duration, transition, music cue | yes (Phase 2+) |
| 6. Prompt Engineering | scenes | optimized prompt packs: image, video, narration, music, SFX | no (Phase 2+) |
| 7. Asset Generation | prompt packs | per scene: image/video, voiceover, subtitles, SFX, music | yes — per-scene (Phase 3+) |
| 8. Quality Evaluation | generated assets | per-scene scores: prompt adherence, visual quality, continuity, narration timing, subtitle alignment, coherence | yes — flag weak scenes for regeneration |
| 9. Rendering | approved assets | MP4, captions, thumbnail, project package | final export (Phase 4+) |

Phase 1 implements stages 1–4. The gate structure carries through to later phases unchanged.

## Agent design

Focused agents, not one giant prompt. Each agent has one job, a typed input schema, and a typed
output schema (validated with Zod before state is written).

| Agent | Responsibility |
| --- | --- |
| Planning Agent | Produces the creative brief from the conversation + idea |
| Research Agent | Produces factual context, timelines, references |
| Script Agent | Writes the initial script |
| Script Reviewer | Scores the script; suggests revisions |
| Storyboard Agent | Converts script → scenes |
| Cinematography Agent | Camera, framing, movement, lighting, composition |
| Prompt Agent | Optimized prompts for downstream models |
| Character Agent | Consistent character descriptions across scenes |
| Environment Agent | Consistency for locations and props |
| Editor Agent | Per-scene transition and music cue fields only |
| QA Agent | Scores outputs; requests regeneration |

**Consistency mechanisms (the "secret sauce"):**

- **Project Memory** — every project carries a structured context: brief, style, audience,
  characters, locations, approved assets. Every agent reads from this single source of truth.
- **Versioning** — every script, storyboard, and prompt revision is saved; users compare and roll back.
- **Model abstraction** — providers behind one interface (ADR-002).
- **Quality gates** — no step silently continues on weak output; evaluate, surface, regenerate.

## LangGraph mechanics

- **Graph topology:** one node per stage. Nodes are sequential; review gates are interrupts.
- **State schema:** typed channels — `brief`, `research`, `script`, `reviewScores`, `storyboard`,
  `scenes`, `prompts`, `assets`, `qualityScores`, plus workflow metadata (`status`, `version`).
- **Checkpointer:** Postgres-backed checkpointer so the graph survives restarts and resumes per
  project (`thread_id = project id`).
- **Human-in-the-loop:** each review gate either uses `interrupt()` inside a review node or
  `interruptAfter` on the producing node. The graph **persists and exits**; the API returns control
  to the client. The user's approval/feedback arrives via `POST /api/projects/:id/stages/:stage/approve`
  which resumes the thread with `Command(resume={approved, feedback})`. Rejection routes the graph
  back to the producing node with the feedback as instruction.
- **Streaming:** agent token streams + stage progress go to the client via SSE (`graph.stream()` +
  API). Token streaming is a Phase 1 nicety; stage-level progress is required.

## Provider layer

- All LLM calls go through a `Provider` interface: `chat(messages, opts)`, `complete(prompt, schema)`
  (structured output with Zod validation), and `embed()` (future).
- **Primary:** NVIDIA Build (`https://integrate.api.nvidia.com/v1`, OpenAI-compatible; free dev tier,
  ~40 RPM). **Fallbacks:** OpenAI, Anthropic. **Future:** Gemini, Together AI, Fireworks.
- **Routing:** per-agent model config (e.g., cheap-fast model for Script Reviewer, high-quality for
  Script Agent). Config lives in one place (`packages/ai/providers/config.ts`), never in agents.
- **Resilience:** exponential backoff with jitter, automatic fallback on 429/5xx, and a **circuit
  breaker** per provider. A generation job that exhausts retries fails visibly at the stage level —
  it never silently proceeds.

## Prompt strategy

- **Structured outputs, not prose prompts:** every agent returns a Zod-validated object. If the
  provider can't do native JSON mode, use a two-step parse (extract → validate → retry once).
- **No prompt engineering by users:** the Prompt Agent is the only place where model-specific prompt
  craft happens; users write ideas in plain language.
- **Context discipline:** Project Memory is summarized/curated before injection; agents never receive
  the entire raw conversation.

## Cost & latency notes

- Free NVIDIA dev tier means Phase 1–2 orchestration is $0 for personal use, but **40 RPM** is the
  binding constraint: serial stage execution by design, small batches, backoff, and provider fallback.
- Heavy media generation (Phase 3+) will require alternate providers or self-hosted NIMs; the
  provider interface exists precisely so this swap is configuration, not surgery.
