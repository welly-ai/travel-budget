#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_root"

required=(
  AGENTS.md
  CLAUDE.md
  README.md
  docs/bootstrap.md
  docs/collaboration.md
  docs/continuous-learning.md
  docs/enforcement-ladder.md
  docs/semantic-consistency-review.md
  .agents/skills/bounded-build-loop/SKILL.md
  .agents/skills/semantic-consistency-review/SKILL.md
  .agent-harness/quality-gate.commands
  .agent-harness/pre-commit.commands
  .agent-harness/pre-push.commands
  .githooks/pre-commit
  .githooks/pre-push
  .codex/hooks.json
  .github/workflows/harness.yml
  .github/workflows/trusted-harness.yml
  scripts/quality-gate.sh
  scripts/run-harness-commands.sh
  scripts/install-git-hooks.sh
  scripts/test-enforcement.sh
  scripts/check-generated-evidence.sh
  scripts/test-generated-evidence.sh
  scripts/check-tracked-whitespace.sh
  scripts/test-tracked-whitespace.sh
  scripts/check-semantic-review-contract.sh
  scripts/test-semantic-review-contract.sh
  scripts/test-quality-gate.sh
  scripts/test-codex-hook-adapter.sh
  scripts/test-claude-hook-adapter.sh
  scripts/check-test-assertions.sh
  scripts/test-test-assertions.sh
  .claude/settings.json
  .claude/hooks/block-git-add-all.sh
  scripts/check-trusted-ci-contract.sh
  scripts/test-trusted-ci-contract.sh
)

for path in "${required[@]}"; do
  if [[ ! -f "$path" ]]; then
    printf 'check-harness: missing required file: %s\n' "$path" >&2
    exit 1
  fi
done

if [[ "$(cat CLAUDE.md)" != '@AGENTS.md' ]]; then
  printf 'check-harness: CLAUDE.md must import the canonical AGENTS.md\n' >&2
  exit 1
fi

grep -Fq 'name: bounded-build-loop' .agents/skills/bounded-build-loop/SKILL.md
grep -Fq 'name: semantic-consistency-review' .agents/skills/semantic-consistency-review/SKILL.md
grep -Fq 'READY_FOR_REVIEW' docs/collaboration.md
grep -Fq 'NEEDS_DECISION' docs/collaboration.md
grep -Fq 'BLOCKED' docs/collaboration.md
grep -Fq 'scripts/quality-gate.sh' .codex/hooks.json
grep -Fq '"timeout": 60' .codex/hooks.json
grep -Fq 'AGENT_HOOK_CLIENT=claude' .claude/settings.json
grep -Fq 'scripts/quality-gate.sh' .claude/settings.json
grep -Fq 'bash scripts/check-harness.sh' .github/workflows/harness.yml
grep -Fq 'runs-on: ubuntu-latest' .github/workflows/harness.yml
if grep -Eq 'semantic|LLM|llm' .github/workflows/harness.yml; then
  printf 'check-harness: semantic review must remain advisory, not a CI blocker\n' >&2
  exit 1
fi

bash -n scripts/quality-gate.sh
bash -n scripts/run-harness-commands.sh
bash -n scripts/install-git-hooks.sh
bash -n scripts/test-enforcement.sh
bash -n scripts/check-generated-evidence.sh
bash -n scripts/test-generated-evidence.sh
bash -n scripts/check-tracked-whitespace.sh
bash -n scripts/test-tracked-whitespace.sh
bash -n .githooks/pre-commit
bash -n .githooks/pre-push
bash -n scripts/check-semantic-review-contract.sh
bash -n scripts/test-semantic-review-contract.sh
bash -n scripts/test-quality-gate.sh
bash -n scripts/test-codex-hook-adapter.sh
bash -n scripts/test-claude-hook-adapter.sh
bash -n .claude/hooks/block-git-add-all.sh
bash -n scripts/check-test-assertions.sh
bash -n scripts/test-test-assertions.sh
bash -n scripts/check-trusted-ci-contract.sh
bash -n scripts/test-trusted-ci-contract.sh
bash scripts/check-semantic-review-contract.sh
bash scripts/test-semantic-review-contract.sh
bash scripts/test-quality-gate.sh
bash scripts/test-codex-hook-adapter.sh
bash scripts/test-claude-hook-adapter.sh
bash scripts/check-test-assertions.sh
bash scripts/test-test-assertions.sh
bash scripts/check-trusted-ci-contract.sh
bash scripts/test-trusted-ci-contract.sh
bash scripts/test-enforcement.sh
bash scripts/check-generated-evidence.sh
bash scripts/test-generated-evidence.sh
bash scripts/check-tracked-whitespace.sh
bash scripts/test-tracked-whitespace.sh

printf 'check-harness: pass\n'
