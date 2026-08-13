#!/usr/bin/env bash
# Copy the landing's film imagery into the API's demo-media dir so the
# FakeProvider demo can hand out REAL media URLs (and the FFmpeg renderer can
# download them into an actual watchable film). Idempotent.
#
# The renderer + demo run from apps/api; data/ is gitignored, so a fresh clone
# must re-run this once. boot-slice.sh already calls it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/apps/api/data/demo-media"
SRC="$ROOT/apps/web/public/frames"
mkdir -p "$DEST"
for f in cold-open.jpg the-flash.jpg first-light.jpg cold-open.mp4; do
  cp -f "$SRC/$f" "$DEST/$f"
done
echo "demo media synced → $DEST"
