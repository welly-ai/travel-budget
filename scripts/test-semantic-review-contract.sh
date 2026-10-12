#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/semantic-review-contract.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture/docs" "$fixture/.agents/skills/semantic-consistency-review"
cp "$project_root/AGENTS.md" "$fixture/AGENTS.md"
cp "$project_root/docs/semantic-consistency-review.md" "$fixture/docs/semantic-consistency-review.md"
cp "$project_root/docs/continuous-learning.md" "$fixture/docs/continuous-learning.md"
cp "$project_root/.agents/skills/semantic-consistency-review/SKILL.md" \
  "$fixture/.agents/skills/semantic-consistency-review/SKILL.md"

SEMANTIC_REVIEW_ROOT="$fixture" bash "$project_root/scripts/check-semantic-review-contract.sh" >/dev/null

rm "$fixture/docs/semantic-consistency-review.md"
set +e
failure_output=$(SEMANTIC_REVIEW_ROOT="$fixture" \
  bash "$project_root/scripts/check-semantic-review-contract.sh" 2>&1)
failure_status=$?
set -e

if [[ "$failure_status" -eq 0 ]]; then
  printf 'test-semantic-review-contract: deliberate missing-file path passed unexpectedly\n' >&2
  exit 1
fi
printf '%s' "$failure_output" | grep -Fq 'missing required file: docs/semantic-consistency-review.md'

printf 'test-semantic-review-contract: pass\n'
