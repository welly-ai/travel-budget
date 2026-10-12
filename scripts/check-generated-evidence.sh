#!/usr/bin/env bash
set -euo pipefail

project_root=${GENERATED_EVIDENCE_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}
if [[ -z "$project_root" || ! -d "$project_root" ]]; then
  printf 'check-generated-evidence: cannot locate project root\n' >&2
  exit 2
fi

tracked=$(git -C "$project_root" ls-files -- \
  '.agent-evidence/**' '.agent-harness/evidence/**')
if [[ -n "$tracked" ]]; then
  printf 'check-generated-evidence: generated evidence must remain outside tracked Git content:\n%s\n' \
    "$tracked" >&2
  exit 1
fi

printf 'check-generated-evidence: pass\n'
