# Bootstrap and customization

Use this repository as a starting point, then make the generated project specific. The generic template should remain small.

## Required project decisions

Before feature work, fill in:

1. Replace the first paragraph of `AGENTS.md` with the project's purpose and add pointers to its architecture and product-invariant docs.
2. Decide who holds the Supervisor, Planner-Reviewer, Implementer, and Human / Owner responsibilities. They may be combined, but ownership must remain explicit.
3. Choose the durable issue, decision-record, and pull-request conventions.
4. Name the project's authoritative architecture and product documents so semantic review can compare claims with implementation.
5. Replace the example command in `.agent-harness/quality-gate.commands` with fast commands that are valid for this repository.
6. Map the project's deterministic checks onto all blocking layers in `docs/enforcement-ladder.md`: pre-commit, pre-push, and trusted self-hosted CI.
7. Configure PR semantic review as advisory. It must not be a required check or acquire blocking authority merely because an LLM produced it.
8. Keep generated logs, screenshots, transcripts, reports, and other evidence outside tracked Git content. Choose an external local directory and CI artifact retention policy; commit only compact conclusions, reproduction instructions, and tests.
9. Exercise `bash scripts/check-harness.sh`, then deliberately break one configured command and confirm that `scripts/quality-gate.sh` blocks.

If the project's default branch is not `main`, update the push branch in `.github/workflows/trusted-harness.yml` and its deterministic contract check.

Harness tests must fail explicitly: macOS `/bin/bash` 3.2 ignores a failed bare `[[ ]]` under `set -e`, and no Bash version exits on a failed `! command`. Write `[[ ... ]] || exit 1` or an `if` block; `scripts/check-test-assertions.sh` rejects the bare forms. Resolve temporary fixture directories with `pwd -P` so macOS `/var` symlinks do not break path comparisons.

Each non-comment line in `.agent-harness/quality-gate.commands` is one Bash command, run from the repository root in file order. Keep this Stop gate quick enough to run at the end of every agent turn. Put slower or environment-dependent checks in CI.

The Stop gate runs configured commands even when the worktree is clean, so a commit made immediately before Stop is still checked. A missing command file blocks rather than silently disabling the gate. Set `AGENT_QUALITY_GATE_DISABLED=1` only for an intentional, documented bypass supplied by the invoking environment.

Run `bash scripts/install-git-hooks.sh` only from a primary checkout with no existing `core.hooksPath` or hook files. The installer fails closed rather than replacing centralized hooks, symlinked hooks, or shared hook configuration from a linked worktree. Compose the commands manually when a repository already has hook management.

The template ships a host-neutral gate runner plus two reference adapters: `.codex/hooks.json` and `.claude/settings.json`. An agent host adapter should invoke `scripts/quality-gate.sh`, send its native end-of-turn payload on standard input, set `AGENT_PROJECT_DIR` to the repository root, and translate the script's block response only if its protocol differs. The script supports the included default response and `AGENT_HOOK_CLIENT=claude`. The Claude adapter also registers a `PreToolUse` guard, `.claude/hooks/block-git-add-all.sh`, that denies `git add -A`, `--all`, and `.` so each commit stages explicit paths. It uses `jq` when available and otherwise inspects the raw payload. Canonical skills live in `.agents/skills/`; Claude Code discovers only `.claude/skills/`, so each skill has a tracked relative symlink there, and `scripts/test-claude-hook-adapter.sh` fails when one is missing. Add the link whenever you add a skill. Adapter files do not prove runtime support: verify the installed host version, supported lifecycle event, project trust, hook trust, configuration discovery, and a real end-of-turn invocation before claiming that an adapter is active.

Deterministic CI and the Stop gate own executable correctness. Configure an LLM reviewer separately to follow `docs/semantic-consistency-review.md`; its drift findings remain advisory until verified.

The authoritative full path runs only on trusted self-hosted CI. The PR workflow always uses a GitHub-hosted runner; neither `pull_request` nor `pull_request_target` may select the trusted runner group. The trusted workflow runs only after a push to protected `main`, plus explicit `workflow_dispatch` for a maintainer to verify a trusted ref. Both workflows use read-only repository permission, pin checkout to a commit SHA, and do not persist checkout credentials. Configure the organization runner group named `trusted-ci` with the labels `self-hosted`, `Linux`, `X64`, and `trusted`, and restrict it to approved private repositories and this trusted workflow. Do not add secrets unless a project has a separately reviewed need.

The repository and codebase are the durable memory interface for both humans and agents. Do not add a separate agent-memory database. A fresh session must be able to recover accepted intent and behavior from repository state and linked durable review records.

## Evolving a mature project

The project owns its learning:

- place verified deterministic recurring protections at the earliest proportional enforcement layer, using latency, determinism, blast radius, and bypass risk as described in `docs/enforcement-ladder.md`;
- add judgment-heavy recurring workflows to its own `.agents/skills/` directory;
- add accepted architecture and product invariants to its own `AGENTS.md` or docs;
- periodically prune obsolete rules and guards.

Upstream only improvements to the bootstrap mechanism itself: for example, a safer command runner, a clearer handoff, or a harness bug that applies across unrelated stacks. Product-specific commands, incidents, providers, schemas, deployment rules, and lessons stay downstream.
