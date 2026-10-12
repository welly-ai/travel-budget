# Enforcement ladder

Use the earliest proportional layer that can enforce an accepted deterministic rule reliably. The policy is language- and tool-neutral: each project supplies commands and adapters for its own stack.

## Layers

1. **Pre-commit:** run the fastest deterministic checks over staged or directly affected content. It blocks the commit and should return actionable feedback within the normal edit loop.
2. **Pre-push:** run broader deterministic checks that are too slow or require too much repository context for every commit. It blocks the push but remains local feedback.
3. **PR advisory review:** use an LLM or human judgment process to find semantic drift across code, docs, comments, skills, and architecture claims. Findings are advice, never a required check, and do not block until independently verified and encoded as an accepted deterministic rule.
4. **CI:** run the authoritative deterministic suite (`pnpm check`) on a GitHub-hosted runner. Failures block delivery. It does not run the golden tests, which need local data.

CI uses an isolated GitHub-hosted runner with read-only repository permission, no repository secrets, and no persisted checkout credentials. A label, approval, comment, or same-repository branch does not make PR code trusted. This project has no self-hosted runner.

## Promotion decision

Promote a recurring lesson only after the same root cause and correct reusable fix have been verified on the real path. Evaluate:

- **Latency:** keep near-instant checks in pre-commit; move slower checks to pre-push or CI.
- **Determinism:** only deterministic rules may block. Judgment-heavy review stays advisory or becomes a Skill.
- **Blast radius:** protections for release, deployment, shared infrastructure, secrets, or cross-project effects belong in CI even when a local preview exists.
- **Bypass risk:** a local hook is convenience, not final authority. Rules whose bypass would create material harm must also be enforced by CI.

Choose the earliest layer that is reliable and proportional. Add a later duplicate only when it closes a distinct bypass or trust gap. Every blocking mechanism requires a positive test and a deliberate-failure test through its real interface.

## Evidence and memory

Generated logs, screenshots, transcripts, model output, reports, and temporary review artifacts stay outside tracked Git content, using an ignored local evidence directory, an external directory, or CI artifact storage. Keep them out of Git (for example with `.gitignore`). The repository keeps durable source, decisions, compact conclusions, reproduction instructions, and deterministic tests.

The repository and codebase are durable memory. Do not add a separate agent-memory database. Agent threads and generated evidence may help current work, but a new session must be able to recover accepted behavior from repository state and linked durable review records.

This template contains only reusable enforcement mechanisms and decision rules. Project-specific incidents, commands, providers, schemas, invariants, and learned lessons remain in the generated project.
