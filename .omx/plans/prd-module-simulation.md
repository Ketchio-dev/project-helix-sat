# PRD — Module Simulation

## Goal
Ship a single-module SAT simulation slice that extends the current diagnostic/timed-set MVP into a more exam-like workflow without introducing persistence or new dependencies.

## Problem
The prototype already supports timed practice, pacing summaries, and exam-mode tutor hardening, but Phase 2 (Test Core) is still incomplete because learners cannot run a module-level simulation with a bounded blueprint and module results.

## Users
- Primary: learner using the web shell
- Secondary: parent/teacher surfaces that consume learner dashboard and session history payloads

## In Scope
- Start a single module simulation from the learner UI
- Assemble a deterministic session-owned item sequence
- Enforce exam-mode hint blocking from trusted server session state
- Submit attempts through the existing attempt API during the active module
- Finish the module and compute module-level results summary
- Surface latest module summary in dashboard/history without breaking existing flows

## Out of Scope
- Multi-module routing
- Full-length mock orchestration
- Postgres/session restore
- New content authoring pipeline
- Real countdown synchronization or proctoring

## Requirements
1. Introduce a distinct session type for module simulation.
2. Keep module sessions compatible with the existing `sessions` and `sessionItems` shapes.
3. Use a deterministic module blueprint from the existing demo item inventory.
4. Return module summary data with accuracy, pacing, completion, and section/domain breakdown.
5. Preserve tutor hint blocking for active module items even if the client spoofs mode.
6. Expose module results in learner dashboard/session history.
7. Keep the slice zero-dependency and in-memory.

## Success Criteria
- Learner can start, work through, and finish a module simulation end-to-end.
- Existing timed-set, teacher, and parent flows keep passing regression coverage.
- Build/test/check stay green.

## Risks
- Session-type branching could sprawl across store/UI.
- Module summary payload drift could break dashboard consumers.
- Current tiny item set limits realism, so summary must stay honest and bounded.

## Follow-up
Immediately after landing this slice, run the next planning pass for Postgres persistence + session restore.
