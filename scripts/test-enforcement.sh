#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture_parent=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/agent-enforcement.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture_parent"
}
trap cleanup EXIT INT TERM

fixture="$fixture_parent/project with space"
mkdir -p "$fixture/.agent-harness" "$fixture/scripts" "$fixture/.githooks"
git -C "$fixture" init -q
git -C "$fixture" config user.name 'Harness Test'
git -C "$fixture" config user.email 'harness@example.invalid'
cp "$project_root/scripts/run-harness-commands.sh" "$fixture/scripts/"
cp "$project_root/scripts/install-git-hooks.sh" "$fixture/scripts/"
cp "$project_root/.githooks/pre-commit" "$fixture/.githooks/"
cp "$project_root/.githooks/pre-push" "$fixture/.githooks/"

# Positive command path executes every configured line.
printf 'printf "first\\n" > positive.txt\nprintf "second\\n" >> positive.txt\n' \
  >"$fixture/.agent-harness/test.commands"
AGENT_PROJECT_DIR="$fixture" bash "$fixture/scripts/run-harness-commands.sh" \
  self-test .agent-harness/test.commands >/dev/null
[[ "$(cat "$fixture/positive.txt")" == $'first\nsecond' ]] || exit 1

# Deliberate failure stops the sequence and returns the command's status.
printf 'printf "before\\n" > before.txt\nexit 23\nprintf "after\\n" > after.txt\n' \
  >"$fixture/.agent-harness/test.commands"
set +e
failure_output=$(AGENT_PROJECT_DIR="$fixture" \
  bash "$fixture/scripts/run-harness-commands.sh" \
  deliberate-failure .agent-harness/test.commands 2>&1)
failure_status=$?
set -e
[[ "$failure_status" -eq 23 ]] || exit 1
[[ -f "$fixture/before.txt" ]] || exit 1
[[ ! -e "$fixture/after.txt" ]] || exit 1
printf '%s' "$failure_output" | grep -Fq 'command 2 failed with status 23'

# A repository without an effective hooksPath can install hooks idempotently.
empty_global="$fixture_parent/empty.gitconfig"
: >"$empty_global"
(
  cd "$fixture"
  GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
    bash scripts/install-git-hooks.sh >/dev/null
  GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
    bash scripts/install-git-hooks.sh >/dev/null
)
[[ "$(git -C "$fixture" config --local --get core.hooksPath)" == .githooks ]] || exit 1

# Exercise the installed hooks through real commit and push operations.
foreign_project="$fixture_parent/foreign-project"
mkdir -p "$foreign_project"
printf 'test "$AGENT_PROJECT_DIR" = "$(git rev-parse --show-toplevel)"\ntest -f hook-allowed\n' \
  >"$fixture/.agent-harness/pre-commit.commands"
printf 'test "$AGENT_PROJECT_DIR" = "$(git rev-parse --show-toplevel)"\ntest -f hook-allowed\n' \
  >"$fixture/.agent-harness/pre-push.commands"
printf 'allowed\n' >"$fixture/hook-allowed"
git -C "$fixture" add .
AGENT_PROJECT_DIR="$foreign_project" GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
  git -C "$fixture" commit -qm baseline
remote="$fixture_parent/remote.git"
git init -q --bare "$remote"
git -C "$fixture" remote add origin "$remote"
AGENT_PROJECT_DIR="$foreign_project" GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
  git -C "$fixture" push -q -u origin HEAD

# Deliberately failing hooks must stop their real Git operations.
printf 'exit 29\n' >"$fixture/.agent-harness/pre-commit.commands"
printf 'change\n' >"$fixture/change.txt"
git -C "$fixture" add change.txt
set +e
pre_commit_output=$(GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
  git -C "$fixture" commit -qm should-not-commit 2>&1)
pre_commit_status=$?
set -e
[[ "$pre_commit_status" -ne 0 ]] || exit 1
printf '%s' "$pre_commit_output" | grep -Fq 'pre-commit: command 1 failed with status 29'

printf 'test -f hook-allowed\n' >"$fixture/.agent-harness/pre-commit.commands"
GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
  git -C "$fixture" commit -qm local-only
printf 'exit 31\n' >"$fixture/.agent-harness/pre-push.commands"
set +e
pre_push_output=$(GIT_CONFIG_GLOBAL="$empty_global" GIT_CONFIG_NOSYSTEM=1 \
  git -C "$fixture" push -q 2>&1)
pre_push_status=$?
set -e
[[ "$pre_push_status" -ne 0 ]] || exit 1
printf '%s' "$pre_push_output" | grep -Fq 'pre-push: command 1 failed with status 31'

# An effective global hooksPath is preserved rather than shadowed locally.
git -C "$fixture" config --local --unset core.hooksPath
global_config="$fixture_parent/global.gitconfig"
printf '[core]\n\thooksPath = machine-baseline/.githooks\n' >"$global_config"
set +e
conflict_output=$(cd "$fixture" && GIT_CONFIG_GLOBAL="$global_config" \
  GIT_CONFIG_NOSYSTEM=1 bash scripts/install-git-hooks.sh 2>&1)
conflict_status=$?
set -e
[[ "$conflict_status" -ne 0 ]] || exit 1
[[ -z "$(git -C "$fixture" config --local --get core.hooksPath || true)" ]] || exit 1
printf '%s' "$conflict_output" | grep -Fq 'preserving effective core.hooksPath'
printf '%s' "$conflict_output" | grep -Fq 'machine-baseline/.githooks'

# An existing hook, including a symlink, cannot be silently bypassed.
existing_hook="$fixture_parent/existing-pre-commit"
printf '#!/usr/bin/env bash\nexit 0\n' >"$existing_hook"
ln -s "$existing_hook" "$fixture/.git/hooks/pre-commit"
set +e
existing_output=$(cd "$fixture" && GIT_CONFIG_GLOBAL="$empty_global" \
  GIT_CONFIG_NOSYSTEM=1 bash scripts/install-git-hooks.sh 2>&1)
existing_status=$?
set -e
[[ "$existing_status" -ne 0 ]] || exit 1
[[ -z "$(git -C "$fixture" config --local --get core.hooksPath || true)" ]] || exit 1
printf '%s' "$existing_output" | grep -Fq 'preserving existing hook'

# A linked worktree cannot change the shared repository hook configuration.
unlink "$fixture/.git/hooks/pre-commit"
linked="$fixture_parent/linked worktree"
git -C "$fixture" worktree add -q -b linked-test "$linked" HEAD
set +e
linked_output=$(cd "$linked" && GIT_CONFIG_GLOBAL="$empty_global" \
  GIT_CONFIG_NOSYSTEM=1 bash scripts/install-git-hooks.sh 2>&1)
linked_status=$?
set -e
[[ "$linked_status" -ne 0 ]] || exit 1
[[ -z "$(git -C "$fixture" config --local --get core.hooksPath || true)" ]] || exit 1
printf '%s' "$linked_output" | grep -Fq 'refusing to change shared hook configuration from a linked worktree'

printf 'test-enforcement: pass\n'
