#!/usr/bin/env bash
set -euo pipefail

project_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$project_root" ]]; then
  printf 'install-git-hooks: run this inside a Git worktree\n' >&2
  exit 2
fi

desired_path=.githooks
current_path=$(git -C "$project_root" config --get core.hooksPath || true)
if [[ -n "$current_path" && "$current_path" != "$desired_path" ]]; then
  current_origin=$(git -C "$project_root" config --show-origin --get core.hooksPath || true)
  printf 'install-git-hooks: preserving effective core.hooksPath: %s\n' "$current_path" >&2
  [[ -n "$current_origin" ]] && printf 'install-git-hooks: source: %s\n' "$current_origin" >&2
  printf 'install-git-hooks: combine it with .githooks manually, then retry\n' >&2
  exit 1
fi

git_dir=$(git -C "$project_root" rev-parse --git-dir)
git_common_dir=$(git -C "$project_root" rev-parse --git-common-dir)
if [[ "$git_dir" != /* ]]; then
  git_dir="$project_root/$git_dir"
fi
if [[ "$git_common_dir" != /* ]]; then
  git_common_dir="$project_root/$git_common_dir"
fi
if [[ "$git_dir" != "$git_common_dir" ]]; then
  printf 'install-git-hooks: refusing to change shared hook configuration from a linked worktree\n' >&2
  printf 'install-git-hooks: install from the primary checkout or combine hooks manually\n' >&2
  exit 1
fi
for hook in pre-commit pre-push; do
  existing="$git_common_dir/hooks/$hook"
  if [[ -e "$existing" || -L "$existing" ]]; then
    printf 'install-git-hooks: preserving existing hook: %s\n' "$existing" >&2
    printf 'install-git-hooks: combine it with .githooks/%s manually, then retry\n' "$hook" >&2
    exit 1
  fi
done

chmod +x "$project_root/.githooks/pre-commit" "$project_root/.githooks/pre-push"
git -C "$project_root" config --local core.hooksPath "$desired_path"
printf 'install-git-hooks: installed core.hooksPath=%s\n' "$desired_path"
