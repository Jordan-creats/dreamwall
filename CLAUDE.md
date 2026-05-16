# SPM — Super Project Manager (Claude Code Adaptation)

SPM is the project management methodology for this codebase. All development follows the 5-phase lifecycle below.

## Five Iron Laws

1. **No code without approved design** — Spec written AND user-approved before implementation
2. **No production code without a failing test first** — TDD: RED → GREEN → REFACTOR
3. **No completion claims without fresh verification** — Run the verification command this turn, show output, then claim
4. **No fixes without root cause investigation** — Symptom fixes are failure; trace root cause first
5. **No WBS `done` without evidence** — File diffs, test output, command results — something verifiable

## Five-Phase Lifecycle

| Phase | Activities | Gate |
|-------|-----------|------|
| **1. Requirement** | Soul-searching (3 probing questions), brainstorming, design doc | User approval |
| **2. Planning** | WBS decomposition, file mapping, task ledger | User confirmation |
| **3. Execution** | Git worktree, TDD, heartbeat logging | Automated |
| **4. Quality** | Verification gate, 3-stage code review, quality gates | Automated |
| **5. Delivery** | Branch merge, deploy (opt), delivery summary, ledger closeout | User decision |

## WBS Task Ledger

The single source of truth: `docs/spm/ledger.md`

- Every task tracked with: ID, Work Package, Dependencies, Context Brief, Exit Criteria, Evidence, Status
- Allowed statuses: `todo`, `doing`, `done`, `blocked`, `skipped`
- Each task marked `done` MUST have verifiable evidence attached
- On context loss: read the ledger → find last `done` → resume from next `todo`

## Context Brief Rule

Every WBS task must include a "Context Brief" — a cold-start sentence that lets any agent (or human) resume the task without reading history. Format: `Cold-start: [what state things are in], [files to touch], [what to do]`

## Quality Gates

- **Always Do:** Run tests before commit, follow naming conventions, validate inputs, sync docs
- **Ask First:** DB schema changes, new dependencies, CI/CD changes, breaking API contracts
- **Never Do:** Commit secrets, edit vendor dirs, remove failing tests without approval, skip review for complex changes

## Mutation Protocol

When the plan needs to change mid-execution:
- split / insert / skip / reorder / abandon — all recorded in the Mutation Log of the WBS ledger
- Each mutation: timestamp, type, affected IDs, reason, new IDs

## Scripts

| Script | Purpose |
|--------|---------|
| `bash openclaw-spm/scripts/attest-wbs.sh` | Generate WBS integrity hash after each ledger update |
| `bash openclaw-spm/scripts/verify-wbs.sh` | Verify WBS hasn't been tampered before trusting |
| `bash openclaw-spm/scripts/switch-ledger.sh <name>` | Switch between parallel task ledgers |
| `python3 openclaw-spm/scripts/session-recovery.py` | Generate interruption recovery report |

## Triggers

When the user says:
- "用 SPM 做 XXX" → Start full 5-phase lifecycle from Requirement
- "继续" → Read ledger, resume from last breakpoint
- "跳过 TDD" / "跳过 review" → Follow user override (Iron Laws are defaults, not overrides)
- "我只想设计" → Run only Phase 1+2, stop before execution

## Project Types

- `code` → Standard TDD → test → coverage
- `docs` → Format validation instead of TDD
- `config` → Format validation + Schema check

## Sub-Skills Reference

SPM sub-skills in `openclaw-spm/skills/`:
- `spm-frontend` / `spm-backend` / `spm-api` — Code standards per layer
- `spm-testing` / `spm-debugging` / `spm-performance` — Quality practices
- `spm-deploy` / `spm-docker` / `spm-security` — Operations
- `spm-database` / `spm-refactor` / `spm-docs` / `spm-standards` — Specialized
- `spm-design-system` / `spm-onboarding` — Design and onboarding

## Workflow Documents

Key workflow references in `openclaw-spm/workflows/`:
- Phase 1: `brainstorming.md`, `external-research.md`
- Phase 2: `writing-plans.md`
- Phase 3: `executing-plans.md`, `test-driven-development.md`, `subagent-driven-development.md`, `dispatching-parallel-agents.md`, `using-git-worktrees.md`
- Phase 4: `verification-before-completion.md`, `code-review.md`, `quality-gates.md`, `systematic-debugging.md`
- Phase 5: `finishing-a-development-branch.md`, `shipping-and-launch.md`
