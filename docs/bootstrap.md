# Bootstrap and customization

Use this repository as a starting point, then make the generated project specific. The generic template should remain small.

## Required project decisions

Before feature work, fill in:

1. Replace the first paragraph of `AGENTS.md` with the project's purpose and add pointers to its architecture and product-invariant docs.
2. Decide who holds the Supervisor, Planner-Reviewer, Implementer, and Human / Owner responsibilities. They may be combined, but ownership must remain explicit.
3. Choose the durable issue, decision-record, and pull-request conventions.
4. Name the project's authoritative architecture and product documents so semantic review can compare claims with implementation.
5. Replace the example commands in `scripts/hooks/config.mjs` with fast commands that are valid for this repository (the single source for the Stop gate and pre-push).
6. Map the project's deterministic checks onto all blocking layers in `docs/enforcement-ladder.md`: pre-commit, pre-push, and CI.
7. Configure PR semantic review as advisory. It must not be a required check or acquire blocking authority merely because an LLM produced it.
8. Keep generated logs, screenshots, transcripts, reports, and other evidence outside tracked Git content. Choose an external local directory and CI artifact retention policy; commit only compact conclusions, reproduction instructions, and tests.
9. Exercise `pnpm test` (which runs `tests/unit/hooks/`), then deliberately break one configured command and confirm that the Stop gate blocks.

If the project's default branch is not `main`, update the push branch in `.github/workflows/harness.yml` and the `main` rules in `scripts/hooks/rules.mjs`.

Harness code is Node (`.mjs`) so it runs on native Windows, macOS, and Linux; do not add Bash scripts. Harness tests are vitest tests in `tests/unit/hooks/` and must build a clean environment for each case instead of inheriting `AGENT_*`, `CLAUDE*`, or `GIT_*` variables from the invoking hook.

Each entry of `STOP_GATE_COMMANDS` in `scripts/hooks/config.mjs` is one command, run from the repository root in order. A leading `node` runs with the Node that started the hook, and `pnpm` is resolved without assuming it is on PATH (see `docs/hooks.md`). Keep this Stop gate quick enough to run at the end of every agent turn. Put slower or environment-dependent checks in CI.

The Stop gate runs configured commands even when the worktree is clean, so a commit made immediately before Stop is still checked. A missing or empty command list blocks rather than silently disabling the gate. Set `AGENT_QUALITY_GATE_DISABLED=1` only for an intentional, documented bypass supplied by the invoking environment.

Run `node scripts/install-git-hooks.mjs` from a primary checkout. It only sets this repository's local `core.hooksPath=.githooks` and never touches global configuration; it refuses when the local setting already points elsewhere or from a linked worktree. Note that a local setting replaces any global `core.hooksPath` for this repository.

The adapters are `.codex/hooks.json` and `.claude/settings.json`; both call the Node entry points in `scripts/hooks/`, which share one rule set. Canonical skills live in `.agents/skills/`; Claude Code discovers only `.claude/skills/`, which holds real copies (no symlinks) produced by `pnpm skills:sync` and verified by `pnpm skills:check`, which is part of `pnpm check`. Adapter files do not prove runtime support: verify the installed host version, supported lifecycle event, project trust, hook trust, configuration discovery, and a real end-of-turn invocation before claiming that an adapter is active.

Deterministic CI and the Stop gate own executable correctness. Configure an LLM reviewer separately to follow `docs/semantic-consistency-review.md`; its drift findings remain advisory until verified.

CI runs `pnpm install --frozen-lockfile && pnpm check` on a GitHub-hosted runner for pull requests and pushes to `main`, with read-only repository permission, checkout pinned to a commit SHA, and no persisted checkout credentials. This project has no self-hosted runner. Do not add secrets unless a project has a separately reviewed need.

The repository and codebase are the durable memory interface for both humans and agents. Do not add a separate agent-memory database. A fresh session must be able to recover accepted intent and behavior from repository state and linked durable review records.

## Evolving a mature project

The project owns its learning:

- place verified deterministic recurring protections at the earliest proportional enforcement layer, using latency, determinism, blast radius, and bypass risk as described in `docs/enforcement-ladder.md`;
- add judgment-heavy recurring workflows to its own `.agents/skills/` directory;
- add accepted architecture and product invariants to its own `AGENTS.md` or docs;
- periodically prune obsolete rules and guards.

Upstream only improvements to the bootstrap mechanism itself: for example, a safer command runner, a clearer handoff, or a harness bug that applies across unrelated stacks. Product-specific commands, incidents, providers, schemas, deployment rules, and lessons stay downstream.
