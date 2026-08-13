# UI Design

> Status: **Final - locked** (2026-08-03, user: "The Cutting Room design is approved as-is") ·
> Last updated: 2026-08-04 · Design language: **"The Cutting Room"** - a mature, cinema-grounded
> direction. (Replaces the "Kiwaski Design" placeholder; see note at the bottom.)
>
> **Visual source of truth:** the **full-system frontend prototype** at
> `prototypes/cutting-room-full.html` is **approved as-is** and is the reference for every screen,
> stage, state, and micro-interaction described below. Code must match both this token sheet and
> the prototype - where they disagree, the prototype wins until this doc is updated.
>
> **Experience evolution (ADR-020, in review):** the user has directed that OpenArt be the primary
> inspiration for the product experience and interface design. `docs/openart-design-direction.md`
> translates that into an original **directed-studio** evolution - the token sheet, type system,
> timecode/slate language, states, motion, and anti-slop guardrails below **stay locked**; the
> workspace layout/IA evolves from two columns to a three-zone console with a Director Bar pending
> your approval.

## Design direction (one paragraph)

This is an **AI creative studio** - software that lives in the world of film production. So the UI
is built from that world's instruments: a **grading suite** (dim room, one calibrated monitor
glowing), **timecode**, a **production slate**, and **script coverage** notes. Chrome - navigation,
stage stepper, rails - is dark and quiet like the suite walls; content panels are warm paper like
the monitor glow. One accent color, record red, is spent exactly once per screen: the live state.
Everything else is hairline rules, warm neutrals, and disciplined typography. The result should read
like a tool built for editors and directors, not a marketing page for an AI startup.

## UX principles

The interface should feel like working with a **creative director** - present, opinionated, and
always explainable; never a black box that hums and returns a file.

1. **The idea is the starting point.** The workspace opens with "What do you want to make?", not an
   empty dashboard.
2. **Progress is always visible.** A project is a pipeline of stages; each stage card shows status,
   progress, content, AI suggestions, and an explicit approval action.
3. **Everything is reviewable and editable.** Text artifacts (brief, research, script) edit
   in-place; version history is one click away.
4. **No prompt engineering.** Users write plain language; prompts are an internal detail (optional
   "advanced" panel only).
5. **Failure is direction, not mood.** Every error explains what happened and offers the next action.
6. **Calm confidence.** The work is the star; the interface stays out of the way until it's needed.

## Information architecture

```
┌ Dashboard ──────────────────────────────────────────────┐
│  "What do you want to make?"   [ idea input ]  (primary) │
│  Projects grid (status chips, updated time)             │
└─────────────────────────────────────────────────────────┘

┌ Project Workspace ──────────────────────────────────────┐
│  Header: project title · stage stepper · actions        │
│  ┌─ Stage Pipeline (the slate / timecode strip) ──────┐ │
│  │ Idea ✓ → Brief ✓ → Research ⏳ → Script → ...      │ │
│  └────────────────────────────────────────────────────┘ │
│  Main panel: current stage content (warm paper)          │
│  Right rail: "Coverage" - AI suggestions · versions      │
│  Footer: approval action ("Approve & continue")          │
└─────────────────────────────────────────────────────────┘
```

- **Dashboard** → project workspace → stage views. One level deep.
- **Stage stepper** doubles as navigation; approved stages are revisitable (read-only, with "edit a
  new version").
- **Approval actions** live at the bottom of the stage content - visible without scrolling when the
  stage awaits review.

## The signature: the slate / timecode stage strip

The one memorable thing, spent once. The stage stepper is styled as a **film production slate**:

- Each stage is a **timecode line** - `01 IDEA · 02 BRIEF · 03 RESEARCH …` - with hairline rules and
  monospace stage codes (like `SC 03`), not generic numbered pills.
- The **active stage** gets viewfinder **corner brackets** (like a camera framing reticle).
- While an agent works, a small **REC dot** pulses beside the running stage - the only animation in
  the chrome.
- Approvals read as stamps: `✓ APPROVED` in mono with the timecode of the approval moment.
- Failures read as a slate "retake" note: `RETAKE - rate limited, retrying`.

Everything else on the page stays quiet: no gradients, no glass, no decorative clutter. That
contrast is what makes the signature land.

## Design tokens ("the token sheet")

Every color, type, and spacing decision in the codebase derives from this sheet - **no ad-hoc
values in components** (ADR-010).

### Color

| Token | Hex | Role |
| --- | --- | --- |
| `--ink` | `#141110` | Suite chrome - nav, stepper, rails, footer (warm near-black) |
| `--surface` | `#1E1A18` | Raised chrome (cards on dark) |
| `--paper` | `#EDE6DA` | Content panels - warm projection light |
| `--paper-dim` | `#D9D0C0` | Muted paper (secondary panels) |
| `--ash` | `#8C8378` | Secondary text / meta on both surfaces |
| `--line` | `#2B2622` | Hairlines on dark · `#C9BFAE` on paper |
| `--rec` | `#E04B3A` | Record red - the single accent: live state, active stage, primary actions |
| `--tungsten` | `#E2A85C` | Tungsten amber - in-progress / pending / warnings |

Restraint rules: `--rec` covers < 5% of any screen; success is never green-by-default - approval is
expressed as the red "stamp" turning to a dark stamped `APPROVED`; amber never used for errors.

### Type

| Role | Face | Notes |
| --- | --- | --- |
| Display | **Cabinet Grotesk** (Fontshare) | Warm, editorial grotesk - stage names, project titles, hero. Set with tight tracking. |
| Body | **General Sans** (Fontshare) | Humanist sans - the script editor, forms, long reading (Söhne-like, mature) |
| Utility/mono | **IBM Plex Mono** | Timecode, stage codes, durations, version numbers, data - the film instrument language |

Scale: display 32/40, stage headers 20/26, body 15/24, meta 13/18, mono caps 11/16 with wide
tracking for codes. No font-smoothing tricks; no faux-bold on mono.

### Layout

- Content column max ~720px on paper panels - script text stays at reading width.
- Right "Coverage" rail ~320px, hairline-separated: AI suggestions (diff previews, one-click apply),
  version history, score breakdown.
- Spacing scale in 4px steps (`4,8,12,16,24,32,48,64`); generous padding on paper panels.
- Border radius: 2px (slate sharpness) - no pill everything, no neumorphism.

### Motion

- **One orchestrated moment:** idea → brief reveal (brief cards cascade in, 120ms stagger).
- REC dot pulse (1.6s) while agents run; stage transitions 240ms ease; approval stamp = 120ms scale
  (1.04 → 1) + hairline flash.
- All motion respects `prefers-reduced-motion`; nothing loops except the REC pulse.

## Anti-"AI-slop" guardrails (hard rules)

- ❌ Purple/violet gradients, glassmorphism, blurred blobs behind heroes.
- ❌ Emoji as UI icons - use a thin 1.5px line icon set (custom or Lucide subset).
- ❌ Centered-everything marketing layout; pill badges everywhere; Inter-only.
- ❌ Stock illustrations / generic 3D - imagery comes from the project's own generated assets.
- ❌ Skeleton shimmer everywhere - skeleton only where a stage is actually running.
- ✅ Hairline discipline, mono timecode, warm neutrals, one accent, real hierarchy.

## Key views (Phase 1)

1. **Dashboard** - hero idea input + project grid (project = slate card: title, stage timecode,
   updated, status chip).
2. **Creative Discovery** - chat-style conversation (idea → clarifying questions → brief preview).
3. **Brief review** - structured cards (topic, audience, platform, style, duration, tone, narration,
   aspect ratio), each editable; suggestions in Coverage rail.
4. **Research review** - timeline/concepts/terminology/references; inline editable.
5. **Script editor** - TipTap full editor on paper; Coverage rail shows review scores (bar/radar per
   dimension), revision notes, version compare + rollback.
6. **Review gates** (shared) - score summary, suggested revisions, "Regenerate" / "Edit manually".

## States that must be designed for

- **Empty:** no projects → invite to type an idea.
- **Loading:** skeleton + stage progress; never a blank spinner.
- **Streaming:** agent text streams in (caret + REC dot + "writing…" in mono).
- **Awaiting review:** content + approval bar.
- **Error:** inline, actionable, retryable, with error code in a dev panel (slate "retake" style).
- **Rate-limited:** "The studio is busy - retrying in 30s" + manual retry.

## Accessibility floor

- Keyboard-focusable everything; visible focus rings (2px `--rec`); semantic HTML; WCAG AA.
- Stage stepper is a real list (`<ol>`); approval buttons say exactly what happens:
  "Approve & continue" - never "Submit".

---

## Note on "Kiwaski Design"

The original brief named "Kiwaski Design" as the visual style. Web research found no established
style by that name, so we treated it as a private aesthetic - and the user then requested a mature,
non-template design instead. **"The Cutting Room" above is that direction.** If you want to fold
Kiwaski specifics in later (palette hexes, a reference site, a motif), we'll add them here and
re-token - the structure makes that a small change, not a redesign.
