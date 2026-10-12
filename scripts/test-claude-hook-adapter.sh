#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/claude-hook-adapter.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture_parent"
}
trap cleanup EXIT INT TERM

fixture="$fixture_parent/project with space"
foreign="$fixture_parent/foreign repository"
mkdir -p "$fixture/.claude/hooks" "$fixture/.agent-harness" "$fixture/scripts" "$foreign"
git -C "$fixture" init -q
git -C "$foreign" init -q
cp "$project_root/.claude/settings.json" "$fixture/.claude/settings.json"
cp "$project_root/.claude/hooks/block-git-add-all.sh" "$fixture/.claude/hooks/"
cp "$project_root/scripts/quality-gate.sh" "$fixture/scripts/quality-gate.sh"

# Read a real adapter command stored in settings.json.
adapter_command() {
  local command
  command=$(grep -F "$1" "$fixture/.claude/settings.json" |
    sed -n 's/^[[:space:]]*"command": "\(.*\)",$/\1/p')
  command=${command//\\\"/\"}
  [[ -n "$command" ]] || exit 1
  printf '%s' "$command"
}

stop_command=$(adapter_command 'scripts/quality-gate.sh')
run_stop() {
  (
    cd "$fixture"
    printf '%s\n' "$1" | CLAUDE_PROJECT_DIR="$fixture" \
      GIT_DIR="$foreign/.git" GIT_WORK_TREE="$foreign" \
      bash -c "$stop_command" 2>"$fixture_parent/stop.stderr"
  )
}

# The Stop adapter runs configured commands at the Claude project root.
printf 'test "$(git rev-parse --show-toplevel)" = "$AGENT_PROJECT_DIR"\n' \
  >"$fixture/.agent-harness/quality-gate.commands"
[[ "$(run_stop '{}')" == '{}' ]] || exit 1
if grep -Fq 'failed' "$fixture_parent/stop.stderr"; then exit 1; fi

# A deliberate failure returns Claude's native blocking decision.
printf 'exit 17\n' >"$fixture/.agent-harness/quality-gate.commands"
[[ "$(run_stop '{}')" == '{"decision":"block","reason":"Configured project quality gate failed; rerun the reported command."}' ]] || exit 1
grep -Fq 'exit 17' "$fixture_parent/stop.stderr"

# A Stop continuation cannot loop.
[[ "$(run_stop '{"stop_hook_active":true}')" == '{}' ]] || exit 1

guard_command=$(adapter_command 'block-git-add-all.sh')
run_guard() {
  local payload
  payload=$(printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1")
  printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$fixture" bash -c "$guard_command"
}

denied=(
  'git add -A'
  'git add --all'
  'git add .'
  'git add -- .'
  'git -C repo add -A'
  'make && git add .'
)
allowed=(
  'git add scripts/quality-gate.sh'
  'git add ./docs'
  'git add .gitignore'
  'git add -p'
  'git status'
)

guard_modes=(0)
command -v jq >/dev/null 2>&1 && guard_modes+=(jq)
for mode in "${guard_modes[@]}"; do
  if [[ "$mode" == 0 ]]; then
    export AGENT_BLOCK_GIT_ADD_NO_JQ=1
  else
    unset AGENT_BLOCK_GIT_ADD_NO_JQ
  fi
  for command in "${denied[@]}"; do
    run_guard "$command" | grep -Fq '"permissionDecision":"deny"' || {
      printf 'test-claude-hook-adapter: guard (%s) allowed: %s\n' "$mode" "$command" >&2
      exit 1
    }
  done
  for command in "${allowed[@]}"; do
    [[ -z "$(run_guard "$command")" ]] || {
      printf 'test-claude-hook-adapter: guard (%s) denied: %s\n' "$mode" "$command" >&2
      exit 1
    }
  done
done
unset AGENT_BLOCK_GIT_ADD_NO_JQ

# Claude discovers each canonical skill through a tracked symlink.
for skill in "$project_root"/.agents/skills/*/SKILL.md; do
  name=$(basename "$(dirname "$skill")")
  link="$project_root/.claude/skills/$name"
  if [[ ! -L "$link" || "$(readlink "$link")" != "../../.agents/skills/$name" ]]; then
    printf 'test-claude-hook-adapter: missing Claude skill link: .claude/skills/%s\n' "$name" >&2
    exit 1
  fi
  cmp -s "$skill" "$link/SKILL.md"
done

printf 'test-claude-hook-adapter: pass\n'
