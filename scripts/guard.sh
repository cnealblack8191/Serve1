#!/usr/bin/env bash
# Fails the build if "supabase" appears anywhere in the repository except the
# planning files that describe the migration itself (SPEC.md, AGENTS.md, README.md,
# CLAUDE_CODE_MIGRATION_PROMPT.md, docs/ and this script). SPEC.md section 14.6.
set -euo pipefail
cd "$(dirname "$0")/.."
hits=$(grep -rIil "supabase" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.amplify \
  --exclude-dir=docs --exclude-dir=playwright-report --exclude-dir=test-results \
  --exclude=SPEC.md --exclude=AGENTS.md --exclude=CLAUDE_CODE_MIGRATION_PROMPT.md \
  --exclude=guard.sh --exclude=README.md --exclude=package-lock.json || true)
if [ -n "$hits" ]; then
  echo "ERROR: 'supabase' found in app code. Serv1 must not use Supabase (AGENTS.md)." >&2
  echo "$hits" >&2
  exit 1
fi
echo "OK: no Supabase references in app code."
