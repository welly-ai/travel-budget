#!/usr/bin/env bash
set -euo pipefail

project_root=${TRACKED_WHITESPACE_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}
if [[ -z "$project_root" || ! -d "$project_root" ]]; then
  printf 'check-tracked-whitespace: cannot locate project root\n' >&2
  exit 2
fi

empty_tree=$(git -C "$project_root" hash-object -t tree /dev/null)
if ! git -C "$project_root" diff --check "$empty_tree" HEAD -- ||
  ! git -C "$project_root" diff --check ||
  ! git -C "$project_root" diff --cached --check; then
  printf 'check-tracked-whitespace: whitespace errors found\n' >&2
  exit 1
fi

untracked_whitespace=
while IFS= read -r -d '' path; do
  # A symlink has no text content; diffing its target directory is not a check.
  [[ -L "$project_root/$path" ]] && continue
  report=$(git -C "$project_root" diff --no-index --check /dev/null "$project_root/$path" 2>&1 || true)
  if [[ -n "$report" ]]; then
    untracked_whitespace+="$report"$'\n'
  fi
done < <(git -C "$project_root" ls-files --others --exclude-standard -z)

if [[ -n "$untracked_whitespace" ]]; then
  printf '%s' "$untracked_whitespace" >&2
  printf 'check-tracked-whitespace: whitespace errors found\n' >&2
  exit 1
fi

printf 'check-tracked-whitespace: pass\n'
