---
name: bounded-build-loop
description: Run bounded implementation and repair loops. Use when building an accepted slice, fixing a reproduced bug, addressing review findings, or deciding whether a recurring failure should become a Hook, Harness check, Skill, or documented invariant.
---

# Bounded build loop

Deliver the smallest accepted change and stop when its real evidence is complete.

## Establish the boundary

1. Read `AGENTS.md`, the active handoff or issue, and relevant project docs.
2. State the observable behavior, constraints, acceptance criteria, required real-path tests, and out-of-scope work. Completion: every handoff heading is answered or the status is `NEEDS_DECISION`.
3. For framework- or provider-sensitive behavior, consult current official documentation. If it does not settle version behavior, inspect the installed version's public types or source. Completion: the planned behavior has a named source of truth.
4. Reproduce a defect before changing it. For new behavior, identify the narrowest existing interface that can express it.

## Execute

1. Implement the smallest change that meets the accepted boundary.
2. Add proportional regression evidence at the same interface. A mock, compilation, or syntax check is supporting evidence unless the acceptance boundary itself is a mock, compilation, or syntax boundary.
3. Run the narrow check, then the required real-path check.
4. Use the `semantic-consistency-review` skill for drift across code and durable claims. Classify every review finding before changing code; LLM findings remain advisory until verified.
5. Use at most two implementation-and-verification passes per handoff unless the handoff explicitly sets another finite cap. Repeat only when new evidence identifies an accepted gap. When the pass cap is exhausted, stop as `BLOCKED` with evidence; use `NEEDS_DECISION` instead when changing the boundary could resolve it.

## Learn without sediment

When a similar failure recurs, follow `docs/continuous-learning.md`. Establish root cause and a reusable fix, then ask whether the knowledge can become deterministic. Promote deterministic knowledge to Hook or Harness plus positive and deliberate-failure tests; promote judgment-heavy knowledge to a Skill. Also record architecture and product invariants in `AGENTS.md` or project docs.

## Stop

Return exactly one terminal status from `docs/collaboration.md`:

- `READY_FOR_REVIEW` when all acceptance criteria and required real-path evidence pass and no blocker remains;
- `BLOCKED` when an objective obstacle remains after bounded attempts;
- `NEEDS_DECISION` when proceeding would invent scope, architecture, risk, or product intent.

Do not reopen a green candidate for a new advisory suggestion without new evidence against an accepted criterion.
