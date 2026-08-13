# Quality Gates

> Status: **Draft** · Last updated: 2026-08-03 · Companion: `ai-pipeline.md` (stages 4, 8).

**Principle:** no step silently continues on weak output. Evaluate, surface issues, allow targeted
regeneration. Scores are **advisory** - the user can always override, because the creative director
works for the user, not the other way around.

## Scoring model

- Each dimension scored **1–5** with a rubric anchor for 1, 3, and 5 (never a bare "rate this 1-5").
- Overall score = weighted mean of dimensions (weights per artifact type below).
- **Threshold:** default `3.8` (configurable in project `settings.quality_threshold`).
- **Decision matrix:**

| Overall score | Result |
| --- | --- |
| ≥ threshold | Stage ready - AI recommends "Approve & continue" |
| below threshold, ≥ 3.0 | AI proposes specific revisions + regenerates with feedback |
| < 3.0 | AI flags the stage as weak, explains why, offers "Revise guidance" or "Start over" |

## Phase 1 - Script review dimensions

Weights in parentheses.

| Dimension | Weight | What it measures | Anchor (score 5) |
| --- | --- | --- | --- |
| Clarity | 20% | Plain, unambiguous language; ideas land on first read | Any listener could restate the point of each section |
| Pacing | 20% | Rhythm of beats; no dead stretches or rushed sections | Natural variation; hook → build → payoff lands in time |
| Emotional engagement | 15% | Emotional arc; why the viewer cares | A clear arc with stakes a general audience feels |
| Retention | 15% | Hook strength + maintenance of interest | Hook is strong; each section earns the next |
| Redundancy | 15% | Repetition, filler, padding | Nothing repeated; every line earns its place |
| Factual consistency | 15% | Aligns with the approved research packet | Every claim traceable to the research packet; no invented facts |

**Grounded in the research packet:** the Script Reviewer receives the approved research packet and
the script; "factual consistency" checks claims against it. If the packet lacks a source, the
reviewer marks the claim `unverified` and the script can't score above 4.0 on that dimension.

## Revision loop

1. Script Agent writes draft → Script Reviewer scores → state persists.
2. Below threshold → Script Reviewer writes **revision notes** (per-section, specific: "Section 3
   repeats the hook; cut to the timeline here").
3. Workflow re-runs the Script Agent with the draft + revision notes as context.
4. Max **2 auto-revisions**; if still below threshold, surface to the user with the scores and
   revision history - the user edits, regenerates, or overrides.

## Later-phase gates (reserved)

- **Scene quality (Phase 3):** per-scene - prompt adherence, visual quality, continuity, narration
  timing, subtitle alignment, overall coherence. Low-scoring scenes are flagged for **targeted
  regeneration** (only that scene, never the whole project).
- **Continuity (Phase 5):** cross-scene character/environment consistency checks against the
  Character/Environment agents' records.
- **Render (Phase 4):** FFmpeg output sanity (duration matches scene plan ±10%, audio present,
  frame size correct, no corruption).

## Recording & measurement

- Scores persist in the versioned artifacts: `scripts.review_scores` (script gate, Phase 1+2  - 
  version rows live on `scripts` itself; there is no `script_versions` table). Per-scene quality
  scoring lands on `scenes` with Phase 5's quality evaluator (development-roadmap.md).
- Every run logs: model route used, latency, token counts, score vector - for provider comparison
  and drift detection later (a quiet Phase 5+ win).
