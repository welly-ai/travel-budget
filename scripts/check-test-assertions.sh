#!/usr/bin/env bash
set -euo pipefail

# Bash 3.2 (macOS /bin/bash) ignores a failed bare [[ ]] under set -e, and no
# Bash version exits on a failed `! command`. Harness tests must fail explicitly.
project_root=${TEST_ASSERTIONS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}

violations=$(grep -nE '^[[:space:]]*(\[\[.*\]\][[:space:]]*|![[:space:]].*)$' \
  "$project_root"/scripts/test-*.sh || true)
if [[ -n "$violations" ]]; then
  printf 'check-test-assertions: append "|| exit 1" or use if/then; set -e does not enforce:\n%s\n' \
    "$violations" >&2
  exit 1
fi

printf 'check-test-assertions: pass\n'
