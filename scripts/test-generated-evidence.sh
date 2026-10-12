#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/generated-evidence.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM

git -C "$fixture" init -q
mkdir -p "$fixture/.agent-evidence" "$fixture/.agent-harness/evidence"

# Ignored or untracked generated evidence is allowed and remains outside Git.
printf '.agent-evidence/\n.agent-harness/evidence/\n' >"$fixture/.gitignore"
printf 'temporary log\n' >"$fixture/.agent-evidence/run.log"
GENERATED_EVIDENCE_ROOT="$fixture" \
  bash "$project_root/scripts/check-generated-evidence.sh" >/dev/null

# A forced add exercises the deliberate-failure path through the real index.
git -C "$fixture" add .gitignore
git -C "$fixture" add -f .agent-evidence/run.log
set +e
failure_output=$(GENERATED_EVIDENCE_ROOT="$fixture" \
  bash "$project_root/scripts/check-generated-evidence.sh" 2>&1)
failure_status=$?
set -e
[[ "$failure_status" -eq 1 ]] || exit 1
printf '%s' "$failure_output" | grep -Fq '.agent-evidence/run.log'

printf 'test-generated-evidence: pass\n'
