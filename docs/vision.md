# Vision

> Status: **Approved** (2026-08-03, user) · Last updated: 2026-08-03

## Mission

Enable anyone to create high-quality AI videos by describing an idea in natural language.

The system acts as an **AI creative studio** that researches, plans, writes, directs, generates,
edits, and exports a finished video with minimal manual work.

## Core principles

1. **The user starts with an idea, not a script.** The system turns "I want a documentary about the
   history of the universe" into a finished production plan.
2. **The AI collaborates rather than simply generates.** Every major step is reviewable, editable,
   and requires user approval before it moves forward.
3. **Every major step is reviewable and editable.** Brief, research, script, storyboard, scenes,
   assets — all editable, all versioned.
4. **Users should rarely need prompt engineering.** The system translates plain language into
   model-optimized prompts internally.
5. **The workflow is model-agnostic.** Providers can be swapped or added without touching the
   workflow logic (see `decisions.md` ADR-002).

## Target user & use case

- **Primary user:** a solo creator (this is a personal project first) who wants to turn ideas into
  finished videos without learning prompting, editing, or rendering.
- **Core loop:** type an idea → answer a few intelligent questions → review an AI-generated script →
  approve a storyboard → click Generate → receive a polished 1–3 minute video.

## What "done" looks like (overall)

- A user can go from a one-line idea to a **downloadable MP4** with captions, narration, music, and a
  thumbnail — through a guided, reviewable workflow.
- Weak outputs are **caught before export** (quality gates), not discovered after.
- Regenerating a single weak scene doesn't restart the whole project.
- Switching the AI provider behind the scenes changes nothing visible to the user.

## The experience

The interface should feel like working with a **creative director**. A project flows through clear
stages, each showing status, progress, editable content, AI suggestions, and an approval action:

```
Idea → Brief → Research → Script → Storyboard → Scenes → Generation → Review → Render → Export
```

## Scope

### In scope (the full vision, built phase by phase — see `development-roadmap.md`)

- Conversational idea capture, creative briefs, research, script writing & review
- Storyboarding, scene planning, prompt optimization
- Image/video generation, voiceover, captions, music
- Quality evaluation, targeted regeneration
- FFmpeg rendering, export (MP4, captions, thumbnail, project package)
- Auth, projects, settings, versioning, provider abstraction

### Explicit non-goals for v1

- Collaborative real-time editing (later phase)
- Multi-language dubbing (later phase)
- Long-form series support (later phase)
- Public API access (later phase)
- Brand kits / template library (later phase)

## Product name

**TBD.** The repo/working title is `videogen`. Product naming is an open decision
(see `decisions.md` — Open decisions). We will not invent a brand name without your approval.
