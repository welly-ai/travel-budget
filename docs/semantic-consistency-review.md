# Semantic-consistency review

This review looks for drift between what a project says and what it does. It complements executable checks; it does not replace or overrule them.

## Authority split

- **Deterministic checks own executable correctness:** build, tests, static analysis, required files, configuration shape, and other machine-verifiable contracts. Their failures may block delivery.
- **LLM review is advisory:** compare code and behavior with comments, docs, `AGENTS.md`, skills, and architecture records. Every finding begins as advice and requires evidence before it changes scope or blocks delivery.

Green CI does not prove semantic consistency. An LLM finding does not prove a defect.

PR semantic review must remain non-blocking and must not be configured as a required check. Only a verified finding promoted into an accepted durable rule and deterministic enforcement can acquire blocking authority.

## Review method

1. Identify the behavior changed by the diff and the executable evidence that covers it. Completion: every changed behavior has a test, check, or an explicit evidence gap.
2. Locate the durable claims that describe or constrain that behavior: comments, user or developer docs, `AGENTS.md`, skills, and architecture records. Completion: every relevant claim source has been examined or named as absent.
3. Compare implementation and claims in both directions. Look for stale descriptions, promised behavior that is not implemented, conflicting agent instructions, skill steps that no longer match the real path, and architecture decisions bypassed by code.
4. Inspect comments separately. Prefer names, types, structure, and small interfaces that make behavior clear. Preserve comments only for non-obvious rationale, constraints, tradeoffs, or consequences that the code cannot express. Treat narration of visible code as removable drift risk.
5. Report findings without editing. Completion: each finding names its location, conflicting claim, concrete evidence, impact, and recommended disposition.

Use this format:

```text
STATUS: ADVISORY
LOCATION:
CLAIM:
EVIDENCE:
IMPACT:
RECOMMENDATION: accept | reject | needs-decision
```

No findings is a valid result when every changed behavior and relevant claim has been compared.

## From advice to durable learning

A maintainer or responsible agent verifies a finding against the real behavior and authoritative project source before accepting it. Correct the local drift first. When the same root cause and reusable fix recur, follow `docs/continuous-learning.md`: ask whether the knowledge can be deterministic, then use latency, determinism, blast radius, and bypass risk to promote it to the earliest proportional blocking layer plus positive and deliberate-failure tests. Otherwise promote the judgment process to a Skill. Architecture and product invariants also remain in `AGENTS.md` or project docs.

Project-specific findings stay in the project. Only improvements to this generic review mechanism belong in the template.
