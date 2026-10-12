#!/usr/bin/env bash
set -euo pipefail

project_root=${SEMANTIC_REVIEW_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}

require_file() {
  if [[ ! -f "$project_root/$1" ]]; then
    printf 'check-semantic-review-contract: missing required file: %s\n' "$1" >&2
    exit 1
  fi
}

require_text() {
  if ! grep -Fq "$2" "$project_root/$1"; then
    printf 'check-semantic-review-contract: %s must contain: %s\n' "$1" "$2" >&2
    exit 1
  fi
}

require_file AGENTS.md
require_file docs/semantic-consistency-review.md
require_file docs/continuous-learning.md
require_file .agents/skills/semantic-consistency-review/SKILL.md

require_text AGENTS.md 'semantic-consistency-review'
require_text docs/semantic-consistency-review.md '**Deterministic checks own executable correctness:**'
require_text docs/semantic-consistency-review.md '**LLM review is advisory:**'
require_text docs/semantic-consistency-review.md 'comments only for non-obvious rationale'
require_text docs/continuous-learning.md 'LLM semantic-review findings begin as advisory.'
require_text .agents/skills/semantic-consistency-review/SKILL.md 'name: semantic-consistency-review'
require_text .agents/skills/semantic-consistency-review/SKILL.md 'docs/semantic-consistency-review.md'

printf 'check-semantic-review-contract: pass\n'
