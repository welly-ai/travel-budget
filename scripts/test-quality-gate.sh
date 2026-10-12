#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/agent-quality-gate.XXXXXX")" && pwd -P)
fixture="$fixture_parent/project with space"
cleanup() {
  rm -rf "$fixture_parent"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture"
git -C "$fixture" init -q
git -C "$fixture" config user.name 'Harness Test'
git -C "$fixture" config user.email 'harness@example.invalid'
mkdir -p "$fixture/.agent-harness" "$fixture/scripts"
cp "$project_root/scripts/quality-gate.sh" "$fixture/scripts/quality-gate.sh"
printf 'baseline\n' >"$fixture/baseline.txt"
printf 'exit 19\n' >"$fixture/.agent-harness/quality-gate.commands"
git -C "$fixture" add .
git -C "$fixture" commit -qm 'test fixture'

run_gate() {
  AGENT_PROJECT_DIR="$fixture" \
  AGENT_QUALITY_GATE_COMMANDS=.agent-harness/quality-gate.commands \
    bash "$fixture/scripts/quality-gate.sh"
}

run_gate_stderr="$fixture_parent/gate.stderr"

# A committed failing command still blocks when the worktree is clean.
clean_failure_output=$(run_gate </dev/null 2>"$run_gate_stderr")
[[ "$clean_failure_output" == '{"continue":false,"stopReason":"Configured project quality gate failed; rerun the reported command."}' ]] || exit 1
grep -Fq 'exit 19' "$run_gate_stderr"

# A dirty real path runs a successful configured command.
printf 'printf "positive output\\n"\ntest -f expected.txt\n' >"$fixture/.agent-harness/quality-gate.commands"
printf 'present\n' >"$fixture/expected.txt"
positive_output=$(run_gate </dev/null 2>"$run_gate_stderr")
[[ "$positive_output" == '{}' ]] || exit 1
grep -Fq 'positive output' "$run_gate_stderr"

# A noisy deliberate failure returns only the native blocking decision.
printf 'printf "failure output\\n"; test -f missing.txt\n' >"$fixture/.agent-harness/quality-gate.commands"
failure_output=$(run_gate </dev/null 2>"$run_gate_stderr")
[[ "$failure_output" == '{"continue":false,"stopReason":"Configured project quality gate failed; rerun the reported command."}' ]] || exit 1
grep -Fq 'failure output' "$run_gate_stderr"
grep -Fq 'test -f missing.txt' "$run_gate_stderr"

# The alternate client receives its native blocking shape without noise.
claude_output=$(AGENT_HOOK_CLIENT=claude run_gate </dev/null 2>/dev/null)
[[ "$claude_output" == '{"decision":"block","reason":"Configured project quality gate failed; rerun the reported command."}' ]] || exit 1

# A Stop continuation bypasses even a failing command and cannot loop.
continuation_output=$(printf '{"stop_hook_active":true}' | run_gate 2>/dev/null)
[[ "$continuation_output" == '{}' ]] || exit 1

# Foreign repository-local Git variables must not redirect configured Git commands.
outer=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/agent-quality-gate-outer.XXXXXX")" && pwd -P)
git -C "$outer" init -q
printf 'test "$(git rev-parse --show-toplevel)" = "$AGENT_PROJECT_DIR"\n' \
  >"$fixture/.agent-harness/quality-gate.commands"
outer_output=$(
  GIT_DIR="$outer/.git" \
  GIT_WORK_TREE="$outer" \
  AGENT_PROJECT_DIR="$fixture" \
  AGENT_QUALITY_GATE_COMMANDS=.agent-harness/quality-gate.commands \
    bash "$fixture/scripts/quality-gate.sh" </dev/null 2>/dev/null
)
rm -rf "$outer"
[[ "$outer_output" == '{}' ]] || exit 1

# Deleting the tracked command file cannot silently disable a dirty gate.
rm "$fixture/.agent-harness/quality-gate.commands"
missing_output=$(run_gate </dev/null 2>"$run_gate_stderr")
printf '%s' "$missing_output" | grep -Fq '"continue":false'
grep -Fq 'missing command file' "$run_gate_stderr"

printf 'test-quality-gate: pass\n'
