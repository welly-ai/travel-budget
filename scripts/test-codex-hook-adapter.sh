#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/codex-hook-adapter.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture_parent"
}
trap cleanup EXIT INT TERM

fixture="$fixture_parent/project with space"
foreign="$fixture_parent/foreign repository"
mkdir -p "$fixture/.codex" "$fixture/.agent-harness" "$fixture/scripts" "$foreign"
git -C "$fixture" init -q
git -C "$foreign" init -q
cp "$project_root/.codex/hooks.json" "$fixture/.codex/hooks.json"
cp "$project_root/scripts/quality-gate.sh" "$fixture/scripts/quality-gate.sh"
printf 'test "$(git rev-parse --show-toplevel)" = "$AGENT_PROJECT_DIR"\n' \
  >"$fixture/.agent-harness/quality-gate.commands"

# Read and execute the real adapter command stored in hooks.json.
adapter_command=$(sed -n 's/^[[:space:]]*"command": "\(.*\)",$/\1/p' \
  "$fixture/.codex/hooks.json")
adapter_command=${adapter_command//\\\"/\"}
[[ -n "$adapter_command" ]] || exit 1

output=$(
  cd "$fixture"
  printf '{}\n' | GIT_DIR="$foreign/.git" GIT_WORK_TREE="$foreign" \
    bash -c "$adapter_command" 2>"$fixture_parent/adapter.stderr"
)
[[ "$output" == '{}' ]] || exit 1
grep -Fq 'quality-gate: $ test "$(git rev-parse --show-toplevel)" = "$AGENT_PROJECT_DIR"' \
  "$fixture_parent/adapter.stderr"
if grep -Fq 'failed' "$fixture_parent/adapter.stderr"; then exit 1; fi

# Prove the fixture would resolve to the foreign repository without sanitizing.
foreign_root=$(GIT_DIR="$foreign/.git" GIT_WORK_TREE="$foreign" \
  git rev-parse --show-toplevel)
[[ "$foreign_root" == "$foreign" ]] || exit 1

printf 'test-codex-hook-adapter: pass\n'
