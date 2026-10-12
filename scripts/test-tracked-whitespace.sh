#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/tracked-whitespace.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM

git -C "$fixture" init -q
git -C "$fixture" config user.name 'Harness Test'
git -C "$fixture" config user.email 'harness@example.invalid'
printf 'clean\n' >"$fixture/content.txt"
git -C "$fixture" add content.txt
git -C "$fixture" commit -qm 'clean fixture'
TRACKED_WHITESPACE_ROOT="$fixture" \
  bash "$project_root/scripts/check-tracked-whitespace.sh" >/dev/null

# An untracked symlink to a directory is not a whitespace error.
mkdir "$fixture/target"
ln -s target "$fixture/linked"
TRACKED_WHITESPACE_ROOT="$fixture" \
  bash "$project_root/scripts/check-tracked-whitespace.sh" >/dev/null
rm "$fixture/linked"

# A whitespace error already stored in HEAD must fail on a clean checkout.
printf 'trailing space \n' >"$fixture/content.txt"
git -C "$fixture" add content.txt
git -C "$fixture" commit -qm 'deliberate whitespace error'
set +e
failure_output=$(TRACKED_WHITESPACE_ROOT="$fixture" \
  bash "$project_root/scripts/check-tracked-whitespace.sh" 2>&1)
failure_status=$?
set -e
[[ "$failure_status" -eq 1 ]] || exit 1
printf '%s' "$failure_output" | grep -Fq 'trailing whitespace'

printf 'test-tracked-whitespace: pass\n'
