#!/usr/bin/env bash
set -uo pipefail

# Deny bulk staging so each commit names the paths it intends to change.
input=$(cat 2>/dev/null || true)

if [[ "${AGENT_BLOCK_GIT_ADD_NO_JQ:-0}" != 1 ]] && command -v jq >/dev/null 2>&1; then
  command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
else
  # Without jq, inspect the raw payload; a false positive only asks for explicit paths.
  command=$input
fi

bulk_add='(^|[;&|[:space:]("])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+add([[:space:]]+[^;&|]*)?[[:space:]]+(-A|--all|\.)([[:space:];&|)"\\]|$)'
if printf '%s' "$command" | grep -Eq -- "$bulk_add"; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Stage explicit paths instead of git add -A, --all, or ."}}\n'
fi
exit 0
