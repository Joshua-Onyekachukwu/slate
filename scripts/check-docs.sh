#!/usr/bin/env bash
# Docs consistency check — greps docs/ for known-stale phrases that contradict
# the one-mutation-path or checkpoint-stage models (see api-design.md "exact
# contract"). Fails (exit 1) on any match so regressions surface in CI.
#
# How to extend: whenever a sweep finds and fixes a stale claim, add the stale
# phrasing here as a fixed string so it can never silently come back.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Fixed strings (grep -F): each is a *stale* phrasing we've already corrected.
# They must NOT match the corrected docs — add only the old wording.
PATTERNS=(
  'ProjectStages'                       # materialized stage rows — stage lives in the checkpoint
  'engine writes stage status'          # old schema principle (workflow doesn't write stage status)
  'with stage `script`'                 # smoke expectation — API returns checkpoint stage `script_review`
  'derived from project row'            # stages view — must derive from the checkpoint
  'poll the project row'                # SSE — the row is deliberately stale
  '__interrupt__'                       # langgraph 0.2.x — payload is on getState().tasks[].interrupts
  'enum (idea | brief'                  # old projects.stage enum — real channel: discovery | brief | ...
  'enum (draft | briefing'              # old projects.status enum — real default: 'active'
  'script_versions.review_scores'       # no script_versions table — scores live on scripts version rows
)

ARGS=()
for p in "${PATTERNS[@]}"; do
  ARGS+=(-e "$p")
done

HITS="$(grep -rnF "${ARGS[@]}" docs/ --include='*.md' 2>/dev/null || true)"

if [ -n "$HITS" ]; then
  echo "❌ docs consistency check failed — stale phrases found:"
  echo "$HITS"
  echo
  echo "These contradict the one-mutation-path or checkpoint-stage models."
  echo "Fix the docs (see api-design.md \"exact contract\"), then re-run: pnpm check:docs"
  exit 1
fi

echo "✅ docs consistent — no known-stale phrases."
