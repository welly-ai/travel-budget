#!/usr/bin/env bash
set -euo pipefail
workflow_dir=${1:-.github/workflows}
trusted_workflow=${2:-${workflow_dir}/trusted-harness.yml}
fail() { printf 'check-trusted-ci-contract: %s\n' "$1" >&2; exit 1; }
[[ -d "$workflow_dir" ]] || fail "missing workflow directory: $workflow_dir"
[[ -f "$trusted_workflow" ]] || fail "missing trusted workflow: $trusted_workflow"
while IFS= read -r workflow; do
  if grep -Eq '^[[:space:]]+(pull_request|pull_request_target):' "$workflow" && grep -Eq '^[[:space:]]+group:[[:space:]]*trusted-ci([[:space:]]|$)' "$workflow"; then
    fail "PR event workflow must not select trusted-ci: $workflow"
  fi
done < <(find "$workflow_dir" -type f \( -name '*.yml' -o -name '*.yaml' \) -print)
grep -Eq '^[[:space:]]+push:' "$trusted_workflow" || fail 'trusted workflow must run on push'
grep -Eq '^[[:space:]]+branches:[[:space:]]*\[main\]' "$trusted_workflow" || fail 'trusted workflow push must be restricted to main'
grep -Eq '^[[:space:]]+workflow_dispatch:' "$trusted_workflow" || fail 'trusted workflow must allow maintainer workflow_dispatch verification'
if grep -Eq '^[[:space:]]+(pull_request|pull_request_target):' "$trusted_workflow"; then fail 'trusted workflow must not have a pull request event'; fi
grep -Eq '^[[:space:]]+contents:[[:space:]]*read([[:space:]]|$)' "$trusted_workflow" || fail 'trusted workflow permissions must grant contents read'
grep -Eq '^[[:space:]]+group:[[:space:]]*trusted-ci([[:space:]]|$)' "$trusted_workflow" || fail 'trusted workflow must select runner group trusted-ci'
grep -Eq '^[[:space:]]+labels:[[:space:]]*\[self-hosted, Linux, X64, trusted\]' "$trusted_workflow" || fail 'trusted workflow must require self-hosted, Linux, X64, trusted labels'
grep -Eq 'uses: actions/checkout@[0-9a-f]{40}([[:space:]]|$)' "$trusted_workflow" || fail 'actions/checkout must be pinned to a commit SHA'
grep -Fq 'persist-credentials: false' "$trusted_workflow" || fail 'checkout credentials must not persist into repository commands'
printf 'check-trusted-ci-contract: pass\n'
