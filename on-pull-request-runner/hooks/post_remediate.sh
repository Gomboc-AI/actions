#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/common.sh"
# Ensure diagnostics.json exists for audit fallback (Phase 2).
if [ ! -f "$ORL_DIAG_DIR/diagnostics.json" ]; then
  printf '%s\n' '{"version":1,"rules":[]}' >"$ORL_DIAG_DIR/diagnostics.json"
fi
