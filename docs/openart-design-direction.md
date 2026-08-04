# Experience & Interface Design — OpenArt-Inspired Direction

> Status: **Draft — in review** · Last updated: 2026-08-04 · Source of the directive: user
> ("use OpenArt as a primary source of inspiration for both the product experience and the
> interface design"). Recorded as **ADR-020** in `decisions.md`.
>
> **What this document is:** the evolution of "The Cutting Room" into the product experience the
> user wants — inspired by OpenArt's product philosophy, workflows, layout, navigation, and
> interaction patterns. It is **not** a clone of OpenArt. Every pattern below was studied, then
> translated into an original design for an AI **video production** studio — the AI as an
> intelligent creative director, the human as the director of record.
>
> **Relationship to the locked design:** the Cutting Room **token sheet** (`ui-design.md`), its
> timecode/slate language, and its micro-interactions remain the visual foundation (approved,
> ADR-010). This document **supersedes the Cutting Room's information architecture, workspace
> layout, and navigation** — the two-column stage view evolves into a three-zone production
> console with a global conversational director bar. Where the approved prototype
> (`prototypes/cutting-room-full.html`) disagrees with this doc on layout/IA, this doc wins pending
> your approval.

---

## 1. What OpenArt teaches us

OpenArt's own thesis is "**the workflow beats the model**" — creators win by having one seamless
workspace, not by chasing the best single model. Its observable patterns:

| # | OpenArt pattern | What it does well |
| --- | --- | --- |
| 1 | **Unified workspace** (Suite) | Image → video → character → audio flow into each other; outputs land in one shared library, reused by the next tool without re-uploading. Context survives across tools. |
| 2 | **Conversational entry** ("What would you like to create today?") | The product opens with an invitation to state intent, not a toolbox. Users start with language. |
| 3 | **The workflow beats the model** | 100+ models sit behind one interface; model choice is invisible until you want it. No leaderboard anxiety. |
| 4 | **Progressive disclosure** | A clean prompt box by default; negative prompt, seed, CFG, aspect ratio, fidelity appear only when a drawer is opened. |
| 5 | **Results → next step** (image into video keyframe, into World) | Generation output is input to the next stage. Momentum, no dead ends. |
| 6 | **@Character / @Image / @World references** | Build a character once, reference it anywhere by name — continuity as a first-class object, not a prompt trick. |
| 7 | **Remix / reroll / variants** | One-click "Remix" loads a generation's parameters; tweak a keyword instead of starting over. Iteration is cheap. |
| 8 | **In-canvas editing** (inpaint / outpaint / upscale / background swap) | Fix a flaw in the result itself, in place, without leaving the workspace. |
| 9 | **Generation history & albums** | Every generation persists with its parameters attached; organized into albums; background jobs run while you browse elsewhere. |
| 10 | **Inspire / templates** | Community creations expose their exact settings; one-click remix into your own workspace. |

**What we deliberately do NOT copy:** OpenArt is a *tool surface for generative models* (you choose
image vs video vs character, pick a model, generate). videogen is a *production pipeline* — the
model surface would actively hurt us. Instead we keep the strengths and translate them into a
directed studio.

---

## 2. The design thesis

> **You are the director. The AI is the studio.**

OpenArt made model-based creation feel like a single flowing workspace. videogen's version of that
insight is a **directed studio floor**: the AI runs the entire production — planning, research,
script, storyboard, prompts, generation, quality — as a crew of agents, and the human sits in the
director's chair approving **takes** at every stage. The interface is a **production console**, not
an editing app and not a model playground.

Three principles, as decision filters for every product/design choice:

1. **Simplicity for the user** — one path from idea to video; one input; decisions surfaced as
   plain-language choices, never as technical parameters.
2. **Professional-quality creative output** — the interface reads like a production tool; the work
   is the star; "takes" are judged on craft.
3. **Extensibility for future AI capabilities** — the "engine" is a swappable detail behind the
   same surfaces (ADR-002); new models, agents, and modalities slot in without redesign.

---

## 3. Experience model: the take system

Every artifact the studio produces — creative brief, research packet, script, storyboard, scene,
prompt pack, production plan — is created as a **take**.

- **A take** is one generated or edited version of an artifact, with its own timestamp and source
  (`AI`, `user edit`, `variation`).
- **Approve a take** → it becomes the *master* and the pipeline advances (the existing
  "Approve & continue" moment, now richer).
- **Regenerate** → the studio produces a new take (reroll). **Request changes** → the studio
  revises per your notes. **Variation** → a subtle alternate take to compare.
- **The take log** is the version history — compare any two takes, roll back, see what changed.

The **preview / approve / regenerate loop** (already the heart of the Cutting Room) becomes the
universal rhythm of the product — every stage, every artifact, every asset. Fast iteration without
ever leaving the flow.

---

## 4. Information architecture

```
┌ Studio Home (launchpad) ────────────────────────────────────────────┐
│  "What do you want to make?"            [idea input]  (primary)     │
│  · production modes: film / essay / explainer / ad  (optional chips)│
│  Continue working ── recent projects (slate cards: stage · timecode)│
│  Recent takes ────── recently generated artifacts (jump back in)    │
└─────────────────────────────────────────────────────────────────────┘

┌ Production Console (a project) ─────────────────────────────────────┐
│ ┌ Left rail: THE CALL SHEET ────────────┐                           │
│ │ 01 IDEA · 00:00:12 ✓                  │                           │
│ │ 02 BRIEF · 00:00:48 ✓                 │                           │
│ │ 03 RESEARCH · 00:02:14 ⏳ [REC]        │  ← stage list (timecode, │
│ │ 04 SCRIPT · …                         │     REC dot, brackets)   │
│ │ 05 STORYBOARD · …                     │                           │
│ │ 06 SCENES · …                         │                           │
│ │ 07 PROMPTS · …                        │                           │
│ │ 08 PLAN · RDY                         │                           │
│ └───────────────────────────────────────┘                           │
│ ┌ Center: THE CANVAS ───────────────────────┐  ┌ Right: NOTES ──┐  │
│ │ current stage artifact (paper):           │  │ director's     │  │
│ │ brief cards · research · script ·         │  │ notes:         │  │
│ │ storyboard · scene editor · prompts ·     │  │ suggestions,   │  │
│ │ plan                                       │  │ scores, takes, │  │
│ │                                            │  │ asset tray     │  │
│ └───────────────────────────────────────────┘  └────────────────┘  │
│ ┌ THE DIRECTOR BAR (persistent, bottom) ─────────────────────────┐ │
│ │  "Make scene 3 more dramatic…"      [REC ●]   [Approve take]   │ │
│ └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- **Studio Home** replaces the plain dashboard: idea input stays primary, but the home also
  surfaces *continuity* — recent projects with stage status and recent takes — so returning to work
  is one click (OpenArt's launchpad, translated).
- **Production Console** replaces the two-column workspace. Three zones: **Call Sheet** (stages),
  **Canvas** (artifact), **Director's Notes** (context). One new element spans the bottom: the
  **Director Bar**.
- **Asset Library** (a fourth surface, per project): every generated asset — image, video, voice,
  music, thumbnails — lands here and is reusable by later stages (OpenArt's shared library,
  translated to R2 storage per ADR-007).

---

## 5. The workspace layout (three-zone console)

### Left rail — the Call Sheet
The approved slate/timecode stepper, turned vertical and made the spine of the workspace. Each
stage is a **call-sheet line**: `01 · 00:00:12 IDEA`, with the live stage carrying the pulsing
**REC dot** and viewfinder corner brackets. Approved stages are revisitable. On narrow screens it
collapses back to the horizontal stepper.

### Center — the Canvas
The current artifact, full-width warm paper (the approved Cutting Room paper panels). This is where
the work happens: the discovery conversation, editable brief cards, research packet, script editor,
storyboard with drag-to-reorder, scene editor, prompt packs, production plan. Read at reading
width; quiet; the star of the screen.

### Right rail — Director's Notes
The evolved Coverage rail. What the studio is *thinking* about this stage: suggestions with
one-click Apply (diff previews), score breakdowns, the take log (compare / roll back), and the
**asset tray** — the generated assets for this stage, each with preview, approve, and regenerate
(OpenArt's in-canvas editing, translated: fix a scene in place, not in a separate tool).

### Bottom — the Director Bar
The signature of the evolution (and the product's second memorable instrument after the slate):
a **persistent conversational command line** at the bottom of every console screen.

- "Make scene 3 more dramatic" → the storyboard agent re-crafts the scene as a new take.
- "Tighten the intro" → the script reviewer proposes a revision.
- "Use a warmer narrator" → the narration prompts re-flag for regeneration with the warmer tone;
- "Regenerate the title image with @galaxy-web" → continuity references resolve.

It is the OpenArt prompt box evolved into a **director's instruction line**: the user talks to the
studio in plain language; the workflow routes to the right agent. No prompt engineering, ever. The
approve action lives beside it, so the loop is *instruct → preview → approve* without moving.

---

## 6. Progressive disclosure: three depths

Every stage renders at the **Take** depth by default. Disclosure is deliberate, never default-on:

1. **The Take** — the artifact plus Approve / Regenerate. Nothing else. This is the entire
   beginner surface.
2. **Director's Notes** — one expand: suggestions, scores, take log, what changed since the last
   take, the asset tray.
3. **The Console** — the Advanced toggle (already in the spec, §12.10): the prompt packs
   (image/video/narration/music/SFX), continuity locks (cast & locations), engine/model selection
   (NVIDIA, OpenAI, Anthropic — behind the scenes by default, ADR-002/005), and per-asset
   regeneration.

Nothing technical is visible until a user reaches for it — the OpenArt pattern, applied with
discipline.

---

## 7. Continuity as first-class objects (the @reference system)

OpenArt's @Character/@World references become **Cast & Locations** — already in the architecture
(Character Agent + Environment Agent, restored in full). Surfaced as:

- A **cast list** and **location list** maintained by the consistency agents, visible in the
  Console depth and in the asset tray.
- **@references** inside any prompt or director-bar instruction: `@narrator`, `@galaxy-web`,
  `@voice:female-warm`. Prompts and instructions resolve them to the registry's canonical
  descriptions, keeping faces, environments, voice, and style consistent across takes and scenes.

The user never writes a character sheet by hand — they see the cast the agents maintain and approve
or adjust it. This is OpenArt's continuity insight, made native to video production.

---

## 8. Templates & remix (designed now, shipped later)

- **Templates** = saved production plans (brief + storyboard + prompt patterns) that a new idea can
  be dropped into — the vision's template library, designed into the plan surface from the start.
- **Remix** = load any take (or a community/team template later) into your workspace with your idea;
  the studio regenerates within the loaded structure.

Multi-user sharing of templates is Phase 6; the *mechanism* (save plan ↔ load plan) is in this
design so nothing needs to be retrofitted.

---

## 9. Interaction patterns (catalog)

| Pattern | Behavior |
| --- | --- |
| **Idea → takes → approval** | The universal loop. Every stage: studio produces a take → you preview → approve (advance) or request changes / regenerate (new take). |
| **Streaming takes** | Agent output streams into the canvas with the caret + REC dot; interruptible ("stop this take"). |
| **Reroll / variation** | "Regenerate" = new take; "Variation" = an alternate take to compare side by side. |
| **Take compare & rollback** | Select two takes in the log → diff view; roll back to any take. |
| **In-place fix** | Regenerate a single scene, asset, or prompt pack without touching the rest (OpenArt inpaint/outpaint translated to the production context). |
| **Background production** | Long jobs run behind the scenes; the queue is visible in Director's Notes; you can leave and return — nothing is lost (OpenArt background generation). |
| **Failure = retake** | Errors read as slate "retake" notes: what happened, what's preserved, the next action ("retrying in 30s", "retry now"). |
| **Asset continuity** | Assets flow forward: script → scenes → prompts → asset tray → plan. Nothing re-uploaded (OpenArt shared library). |

---

## 10. What stays from the Cutting Room (unchanged)

- **Token sheet** (ink / surface / paper / ash / line / rec red / tungsten amber), radius 2px,
  hairline discipline, the restraint rules — `--rec` < 5% of any screen, no green-success-by-default.
- **Type system**: Cabinet Grotesk display, General Sans body, IBM Plex Mono utility.
- **Timecode + REC dot + slate language** — the signature instrument.
- **Approval stamps** ("✓ APPROVED · TC"), retake notes, coverage scores.
- **All motion rules** (`prefers-reduced-motion`, one orchestrated moment, REC pulse only).
- **Anti-"AI-slop" guardrails** — verbatim.
- **States**: empty, loading, streaming, awaiting review, error, rate-limited — unchanged.
- **Accessibility floor** — unchanged.

---

## 11. What changes (the delta to build after approval)

| Surface | Before (Cutting Room) | After (this direction) |
| --- | --- | --- |
| Home | Hero + project slate grid | Studio launchpad: idea input + production modes + recent projects + recent takes |
| Workspace | Two columns: stage panel + coverage rail | Three zones + director bar: call sheet / canvas / notes / director bar |
| Stage strip | Horizontal stepper | Horizontal stepper on mobile; vertical **call sheet** rail in the console |
| Context rail | "Coverage" | **Director's Notes** (suggestions, scores, take log, asset tray) |
| Input surface | Per-stage approve bar | Persistent **Director Bar** (conversational) + contextual approve |
| History | Version rows | **Take log** with compare + rollback + variation |
| Assets | (not surfaced) | **Asset tray** per stage + per-project **Asset Library** |
| Continuity | Characters/locations in crew sheet | **Cast & Locations** registry with @references + continuity locks |
| Templates | (not in Phase 1+2) | Plan save/load mechanism designed in (shipped later) |

**Impact on the current build:** the Next.js app in `apps/web` (Task 1 port of the approved
prototype) keeps its tokens, components, and interactions but is re-laid-out to the console
structure and gains the Director Bar, take log, and asset tray. This is the first UI work after
approval — component reuse is high because the token sheet and stage content are unchanged.

---

## 12. Open questions for you

1. **Director Bar scope in Phase 1+2** — ship it as a real instruction surface wired to the agents
   (recommended), or as a visible-but-inert input until the workflow lands?
2. **Studio Home depth** — recent takes surface now, or keep the home minimal (idea input +
   projects) and add takes with the take log in Phase 3?
3. **Cast & Locations surfacing** — show the registry in the Console depth only (recommended), or
   also in the Director's Notes for every stage?
4. **Asset Library** — build the per-project library surface in Phase 1+2 (recommended, it has no
   media yet but the structure ships), or defer the surface to Phase 3 with the generation
   pipeline?
