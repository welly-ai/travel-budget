# Collaboration protocol

Use roles to make ownership explicit. One person or agent may hold more than one role on small work, but every decision and artifact still has one owner.

## Roles

- **Human / Owner** sets intent, priority, risk tolerance, and final product decisions.
- **Supervisor** maintains cross-session coherence, assigns ownership, integrates results, guards scope, and performs final review. It escalates rather than inventing product decisions.
- **Planner-Reviewer** decomposes work, records constraints, acceptance criteria, and tests, then reviews executable evidence and semantic consistency. It follows `docs/semantic-consistency-review.md` for advisory drift review. After handoff, it avoids becoming the main Implementer.
- **Implementer** produces the approved code, tests, and integration evidence. It escalates changes to scope, architecture, or domain meaning.
- **temporary-worker** owns one bounded investigation or artifact. Its handoff names the evidence produced. The assigning role integrates the result. A temporary-worker does not delegate again unless explicitly authorized.

Parallel work is appropriate when ownership and merge cost are both clear. Keep one owner for a semantic core, integrate centrally, and rerun combined verification.

## Durable state

The repository and codebase are the durable memory interface. Do not create a separate agent-memory database or require private thread history to reconstruct accepted behavior.

Record state according to its lifetime:

1. Docs or decision records: architecture and product invariants.
2. Issues: goal, scope, acceptance, dependencies, and decisions still needed.
3. Branches, commits, and pull requests: implementation and formal review.
4. Agent threads, local worktrees, and generated evidence: tactical context only.

A new session recovers by reading `AGENTS.md`, relevant docs, the active issue and pull request, and current Git state before consulting thread history.

Generated logs, screenshots, transcripts, reports, and review scratch files stay outside tracked Git content. Durable repository records contain only the conclusion, source or reproduction path, acceptance decision, and executable regression evidence needed by a future session.

## Standard handoff

Use this exact shape. Omit no heading; write `None` when a section is empty.

```text
TASK:
CONTEXT:
CONSTRAINTS:
ACCEPTANCE:
TESTS:
OUT_OF_SCOPE:
OPEN_QUESTIONS:
```

The receiving role does not infer answers to `OPEN_QUESTIONS`. It raises `NEEDS_DECISION` when an answer can change scope, architecture, risk, or irreversible behavior.

## Terminal statuses

- `READY_FOR_REVIEW`: the deliverable and required verification are complete. Include branch or artifact, concise change summary, exact verification evidence, and any unresolved advisory semantic findings.
- `BLOCKED`: an external dependency or objective obstacle prevents progress. Include evidence, attempts made, and the condition that unblocks work.
- `NEEDS_DECISION`: a responsible owner must choose. Include the decision owner, options, tradeoffs, and a recommendation.

Do not use `BLOCKED` for ordinary difficulty or `READY_FOR_REVIEW` while required real-path evidence is missing. An Implementer opens the pull request and stops at `READY_FOR_REVIEW`; it does not merge its own work.
