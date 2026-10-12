#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'usage: %s PHASE COMMAND_FILE\n' "${0##*/}" >&2
  exit 2
}

[[ "$#" -eq 2 ]] || usage
phase=$1
command_file=$2

project_root=${AGENT_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}
if [[ -z "$project_root" || ! -d "$project_root" ]]; then
  printf '%s: cannot locate project root\n' "$phase" >&2
  exit 2
fi

if [[ "$command_file" != /* ]]; then
  command_file="$project_root/$command_file"
fi
if [[ ! -f "$command_file" ]]; then
  printf '%s: missing command file: %s\n' "$phase" "$command_file" >&2
  exit 2
fi

line_number=0
while IFS= read -r command || [[ -n "$command" ]]; do
  line_number=$((line_number + 1))
  case "$command" in
    ''|'#'*) continue ;;
  esac

  printf '%s: $ %s\n' "$phase" "$command" >&2
  set +e
  (
    cd "$project_root"
    bash -o pipefail -c "$command"
  )
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    printf '%s: command %s failed with status %s: %s\n' \
      "$phase" "$line_number" "$status" "$command" >&2
    exit "$status"
  fi
done <"$command_file"

printf '%s: pass\n' "$phase"
