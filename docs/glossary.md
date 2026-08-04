# Glossary

> Status: **Draft** · Last updated: 2026-08-03 · Use these terms exactly across docs, code, and UI.
> Missing term? Add it here before using it.

| Term | Definition |
| --- | --- |
| **Idea** | The user's initial natural-language description of what they want to make. The entry point of every project. |
| **Creative Brief** | Structured output of Stage 1: topic, audience, platform, style, duration, tone, narration, aspect ratio. User-approved before research. |
| **Research Packet** | Stage 2 output: timeline, concepts, terminology, references, key events. The factual grounding for the script. |
| **Script** | Stage 3 output: title, hook, introduction, body, conclusion, call-to-action. |
| **Script Version** | A snapshot of a script (AI-generated or user-edited). Versioning enables compare + rollback. |
| **Storyboard** | Stage 5 output: the script decomposed into ordered scenes. |
| **Scene** | One storyboard unit: narration, visual description, camera direction, duration, transition, music cue. |
| **Prompt Pack** | Stage 6 output: per-scene optimized prompts (image, video, narration, music, SFX). |
| **Asset** | A generated artifact for a scene: image, video clip, voiceover, SFX, music bed, captions. Stored in R2. |
| **Review Gate** | A point where the workflow pauses (LangGraph interrupt) for human approval/feedback before continuing. |
| **Stage** | One step in the user-facing pipeline: Idea, Brief, Research, Script, Storyboard, Scenes, Generation, Review, Render, Export. |
| **Phase** | One development milestone (Phase 1–6). A phase implements one or more stages. |
| **Thread** | A LangGraph execution identified by `thread_id` (= project id). State persists per thread in the checkpointer. |
| **Project Memory** | The curated, versioned context every agent reads: brief, style, audience, characters, locations, approved assets. |
| **Provider** | An AI backend behind the Provider interface (NVIDIA Build, OpenAI, Anthropic, …). |
| **Model Route** | The configured choice of provider+model per agent role (e.g., "script_agent → nvidia/deepseek-v3"). |
| **Quality Score** | 1–5 rubric score per dimension (see quality-gates.md). Advisory; user can override. |
| **Job** | A durable background unit of work (BullMQ): research, script, storyboard, image, video, voice, render, export. |
| **Export** | The final deliverable(s): MP4, captions, thumbnail, project package. |
| **Kiwaski Design** | The user's originally specified visual style. Unresolved — superseded by the design direction in ui-design.md unless the user defines Kiwaski specifics. |
