# Continuous-learning protocol

Improve the project only from established evidence. The purpose is to shorten a proven future loop, not to accumulate every incident as a rule.

## Diagnose before teaching

For a framework, provider, tool, or runtime failure:

1. Reproduce the failure on the actual relevant path.
2. Check current official documentation.
3. When documentation is incomplete or version-sensitive, inspect the installed version's public types or source.
4. Establish the root cause and verify the correct fix on the same path.
5. Record only evidence needed for the current work, outside tracked Git content; retain a compact durable conclusion and reproduction path in the repository.

One occurrence is not automatically reusable knowledge. Reconsider promotion when a similar failure recurs and the same root cause and fix apply.

LLM semantic-review findings begin as advisory. Verify each finding against the changed behavior and authoritative project sources before treating it as a failure or reusable lesson.

## Promotion decision

Ask first: **Can this knowledge be made deterministic?** Then use `docs/enforcement-ladder.md` to place it at the earliest proportional layer.

- **Yes:** assess latency, determinism, blast radius, and bypass risk. Encode the smallest check or repair at the earliest layer that can run reliably without disproportionate cost: pre-commit, pre-push, or trusted self-hosted CI. Add a positive test plus a deliberate-failure test that exercises the mechanism's real interface. Do not duplicate a check at later layers without a distinct risk reason.
- **No:** encode the judgment process as a Skill with explicit triggers, ordered steps, completion criteria, and stop conditions.
- **Architecture or product invariant:** also record it in `AGENTS.md` or the relevant project documentation, whether or not automation exists.

Promote only after root cause and a reusable correct fix are established. Prefer a removal or update of stale guidance over another layer. Keep project-specific learning in the mature project; do not upstream it into this generic template unless it changes the generic mechanism for projects of many kinds.

## Bounded maintenance

A proposed guard earns a place when it covers a normal workflow, has meaningful impact, is smaller than the failure it prevents, and has a clear test and removal condition. Its layer must remain proportional: low-latency and highly deterministic checks belong early; expensive, environment-dependent, high-blast-radius, or easily bypassed protections belong in trusted CI. Hypothetical bypasses, one-off mistakes, and advice without a reproduced failure remain incident notes or review feedback rather than permanent machinery.
