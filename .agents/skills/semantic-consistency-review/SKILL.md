---
name: semantic-consistency-review
description: Review advisory semantic drift. Use when changes may disagree with comments, docs, AGENTS.md, skills, architecture records, or code behavior, and when deciding whether comments preserve non-obvious rationale or merely narrate code.
---

# Semantic-consistency review

Read and follow `docs/semantic-consistency-review.md`.

Review the complete changed behavior and every relevant durable claim named by that contract. Report findings in its required format. Findings remain advisory until verified; do not edit implementation or durable guidance during this review.

Finish with one of:

- `NO_SEMANTIC_DRIFT_FOUND`, followed by the behavior and claim surfaces examined;
- `ADVISORY_FINDINGS`, followed by every finding and any evidence gaps;
- `NEEDS_DECISION`, when authoritative sources conflict and the responsible owner must choose.
