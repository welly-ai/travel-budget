#!/usr/bin/env bash
set -uo pipefail

input=$(cat 2>/dev/null || true)

# A Stop continuation must not invoke the gate again.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  printf '{}\n'
  exit 0
fi

if [[ "${AGENT_QUALITY_GATE_DISABLED:-0}" == 1 ]]; then
  printf '{}\n'
  exit 0
fi

repo_root=${AGENT_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}
if [[ -z "$repo_root" || ! -d "$repo_root" ]]; then
  printf '{}\n'
  exit 0
fi

git_at_project() {
  (
    while IFS= read -r variable; do
      [[ -n "$variable" ]] && unset "$variable"
    done < <(git rev-parse --local-env-vars 2>/dev/null || true)
    git -C "$repo_root" "$@"
  )
}

block_stop() {
  case "${AGENT_HOOK_CLIENT:-codex}" in
    claude)
      printf '{"decision":"block","reason":"Configured project quality gate failed; rerun the reported command."}\n'
      ;;
    *)
      printf '{"continue":false,"stopReason":"Configured project quality gate failed; rerun the reported command."}\n'
      ;;
  esac
}

command_file=${AGENT_QUALITY_GATE_COMMANDS:-.agent-harness/quality-gate.commands}
if [[ "$command_file" != /* ]]; then
  command_file="$repo_root/$command_file"
fi
if [[ ! -f "$command_file" ]]; then
  printf 'quality-gate: missing command file: %s\n' "$command_file" >&2
  block_stop
  exit 0
fi

failed_command=
failed_status=0
line_number=0

while IFS= read -r command || [[ -n "$command" ]]; do
  line_number=$((line_number + 1))
  case "$command" in
    ''|'#'*) continue ;;
  esac

  printf 'quality-gate: $ %s\n' "$command" >&2
  (
    while IFS= read -r variable; do
      [[ -n "$variable" ]] && unset "$variable"
    done < <(git rev-parse --local-env-vars 2>/dev/null || true)
    cd "$repo_root" || exit 1
    bash -o pipefail -c "$command"
  ) >&2
  status=$?
  if [[ "$status" -ne 0 ]]; then
    failed_command=$command
    failed_status=$status
    break
  fi
done <"$command_file"

if [[ "$failed_status" -eq 0 ]]; then
  printf '{}\n'
  exit 0
fi

printf 'quality-gate: command %s failed with status %s: %s\n' \
  "$line_number" "$failed_status" "$failed_command" >&2

block_stop

# Hook protocols consume the JSON decision, so a handled check failure exits 0.
exit 0
