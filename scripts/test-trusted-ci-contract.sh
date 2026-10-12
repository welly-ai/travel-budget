#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/agent-trusted-ci.XXXXXX")" && pwd -P)
cleanup() { rm -rf "$fixture_parent"; }
trap cleanup EXIT INT TERM
cp -R "$project_root/.github/workflows" "$fixture_parent/good"
bash "$project_root/scripts/check-trusted-ci-contract.sh" "$fixture_parent/good" "$fixture_parent/good/trusted-harness.yml" >/dev/null
expect_failure() {
  local expected=$1 directory=$2 trusted=$3 output status
  set +e
  output=$(bash "$project_root/scripts/check-trusted-ci-contract.sh" "$directory" "$trusted" 2>&1); status=$?
  set -e
  [[ "$status" -ne 0 ]] || { printf 'expected contract failure\n' >&2; exit 1; }
  printf '%s' "$output" | grep -Fq "$expected"
}
cp -R "$fixture_parent/good" "$fixture_parent/pr-trusted"
printf '%s\n' '  unsafe:' '    runs-on:' '      group: trusted-ci' >>"$fixture_parent/pr-trusted/harness.yml"
expect_failure 'PR event workflow must not select trusted-ci' "$fixture_parent/pr-trusted" "$fixture_parent/pr-trusted/trusted-harness.yml"
for event in pull_request pull_request_target; do
  cp -R "$fixture_parent/good" "$fixture_parent/${event}"
  awk -v event="$event" '{ print; if ($0 ~ /^[[:space:]]*workflow_dispatch:/) print "  " event ":" }' \
    "$fixture_parent/${event}/trusted-harness.yml" >"$fixture_parent/${event}/changed.yml"
  mv "$fixture_parent/${event}/changed.yml" "$fixture_parent/${event}/trusted-harness.yml"
  expect_failure 'PR event workflow must not select trusted-ci' "$fixture_parent/${event}" "$fixture_parent/${event}/trusted-harness.yml"
done
printf 'test-trusted-ci-contract: pass\n'
