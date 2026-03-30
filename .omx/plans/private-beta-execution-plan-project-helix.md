# Project Helix SAT — repo-grounded private-beta execution plan

Prepared: 2026-03-30
Owner lane: planner / worker-1

## Goal
Ship the next private-beta slice without broad architectural churn by sequencing three parallel lanes already implied by the repo: (1) learner product contract freeze gaps, (2) browser QA expansion across the core activation journey, and (3) the highest-leverage realism/content-depth upgrades that the current audit still flags as the main trust bottlenecks.

## Repo-grounded starting point

### What is already true
- The private-beta slice and three-lane framing already exist in `docs/product-completion-milestones.md`.
- The core learner path is already wired in runtime code and tests: `services/api/src/router.mjs`, `services/api/src/store.mjs`, `apps/web/public/app.js`, `tests/api.test.mjs`, `scripts/run-playwright-learner-smoke.mjs`.
- The current audit says the biggest remaining product gap is realism/content depth, not missing blueprint coverage: `docs/sat-coverage-audit.md`, `docs/audits/project-helix-sat-coverage.md`, `README.md`.
- The no-new-dependencies / audit-honesty / reviewable-diff posture is already encoded in docs and package scripts: `package.json`, `content/README.md`, `docs/quality/bluebook-khan-slice.md`.

### Current freeze-gap evidence
The repo already has durable schema files for `plan_explanation`, `projection_evidence`, `weekly_digest`, `learner_narrative`, `what_changed`, `curriculum_path`, and `program_path` under `packages/schemas/`, but several product-critical learner contracts still live only as inline shapes inside `services/api/src/validation.mjs`:
- `GoalProfileResponse`
- `NextBestActionResponse`
- `DiagnosticRevealResponse`
- dashboard-only nested shapes like `latestSessionOutcome`, review response, study-mode actions, and tomorrow preview

That means lane 1 should focus less on inventing new payloads and more on freezing/extracting the contracts that the UI and smoke runner already depend on.

## Execution lanes

## Lane 1 — Freeze learner product contracts before deeper UI churn

### Objective
Make the activation and learner-home contracts explicit, file-backed, and reusable so future UI or QA work stops depending on large inline schemas and ad hoc dashboard nesting.

### Primary files
- `packages/schemas/README.md`
- `packages/schemas/planning/*.schema.json`
- `packages/schemas/reporting/*.schema.json`
- `packages/schemas/scoring/*.schema.json`
- **new schema homes likely needed:**
  - `packages/schemas/learner/goal-profile.schema.json`
  - `packages/schemas/learner/next-best-action.schema.json`
  - `packages/schemas/learner/diagnostic-reveal.schema.json`
  - `packages/schemas/learner/session-outcome.schema.json`
  - `packages/schemas/learner/review-recommendations.schema.json`
  - optional dashboard-fragment schemas for `study-modes`, `tomorrow-preview`, `goal-profile-update-request`
- `services/api/src/validation.mjs`
- `services/api/src/router.mjs`
- `services/api/src/store.mjs`
- `apps/web/public/app.js`
- `tests/api.test.mjs`
- `tests/foundation.test.mjs`

### Work items
1. Extract inline validation objects for goal profile, next-best-action, diagnostic reveal, review payload, and session outcome into `packages/schemas/` JSON files.
2. Reduce `services/api/src/validation.mjs` to composition/wiring instead of owning the canonical contract bodies.
3. Keep route-level schemas explicit for `/api/goal-profile`, `/api/next-best-action`, `/api/diagnostic/reveal`, `/api/review/recommendations`, and any dashboard fragments still consumed through the aggregate learner response.
4. Add a small doc section that names the frozen learner-surface contracts and points contributors to the schema directory rather than `validation.mjs`.

### Acceptance criteria
- All private-beta learner contracts are defined in `packages/schemas/` rather than only inline in `services/api/src/validation.mjs`.
- `services/api/src/router.mjs` continues validating `/api/goal-profile`, `/api/next-best-action`, and `/api/diagnostic/reveal` against named response schemas.
- `tests/api.test.mjs` proves that goal setup, diagnostic reveal, quick win unlock, and learner-home CTA behavior still match the frozen contracts.
- `tests/foundation.test.mjs` or equivalent schema checks fail clearly if a contract changes without updating the shared schema file.

### Key risk
Moving schemas without trimming overlap can create two sources of truth. The lane should include deletion/consolidation, not schema duplication.

---

## Lane 2 — Expand browser QA across the exact activation-to-dashboard journey

### Objective
Turn the current smoke runner into a private-beta guardrail for the full learner funnel the milestones doc already names: signup → goal setup → diagnostic start → reveal → quick win → dashboard review → exam-profile module start.

### Primary files
- `scripts/run-playwright-learner-smoke.mjs`
- `apps/web/public/index.html`
- `apps/web/public/app.js`
- `apps/web/public/styles.css`
- `apps/web/README.md`
- `tests/project-helix-sat-audit.test.mjs`
- `docs/product-completion-milestones.md`
- `docs/quality/learner-web-review.md`

### Repo evidence
The current smoke runner already covers most of the intended flow and explicitly checks:
- register → goal setup or learner shell
- diagnostic preflight and reveal
- quick win summary / session outcome
- dashboard expansion, weekly digest, review lesson pack
- duplicate IDs
- exam-profile module start with `0/22 answered`

So this lane is not greenfield; it is a hardening/coverage-completion pass on an existing harness.

### Work items
1. Keep the existing no-dependency harness model (`npm install --no-save playwright` inside temp dir) and extend assertions around the missing brittle points rather than replacing the runner.
2. Add explicit assertions for:
   - goal-setup persistence/resume language
   - reveal → first CTA handoff correctness
   - dashboard review visibility after quick win completion
   - exam-profile module start remaining section-specific and progress-accurate
3. Add small helper seams where needed in the runner so failure output names the exact product surface that broke.
4. Keep `apps/web/README.md` and learner QA docs aligned with the runner’s required IDs and page contracts.

### Acceptance criteria
- `npm run smoke:learner` exercises the complete activation journey named in `docs/product-completion-milestones.md` without manual intervention.
- Smoke failures mention the concrete failing surface (goal setup, reveal, quick win, dashboard review, exam-profile module) rather than generic navigation failure.
- `tests/project-helix-sat-audit.test.mjs` continues to assert the runner covers duplicate IDs, lesson-pack review, and exam-profile module progress.
- No new runtime dependencies are introduced.

### Key risk
This runner is ID-sensitive by design. UI cleanup that renames selectors without updating docs/tests will create brittle false negatives.

---

## Lane 3 — Highest-leverage realism and content-depth improvements

### Objective
Address the audit’s remaining trust bottlenecks: module realism is still compressed, grid-in realism is still a minority path, and authored lesson depth is still thinner than the coaching surface promises.

### Primary files
- `docs/sat-coverage-audit.md`
- `docs/audits/project-helix-sat-coverage.md`
- `docs/quality/bluebook-khan-slice.md`
- `content/README.md`
- `content/generated-items.json`
- `services/api/src/demo-data.mjs`
- `packages/assessment/src/item-selector.mjs`
- `packages/assessment/src/project-helix-sat-audit.mjs`
- `packages/curriculum/src/lesson-assets.mjs`
- `apps/web/public/review-lesson-pack.js`
- `apps/web/public/app.js`
- `scripts/audit-project-helix-sat.mjs`
- `scripts/check-content-release-bars.mjs`
- `tests/selector.test.mjs`
- `tests/student-produced-response.test.mjs`
- `tests/review-lesson-pack.test.mjs`
- `tests/sat-coverage-audit.test.mjs`
- `tests/project-helix-sat-audit.test.mjs`

### Work items
1. **Module realism:** raise the module-shape contract conservatively from the current 12-item default only when audit/docs/tests move together; keep section-separated practice honest.
2. **Grid-in realism:** extend authored grid-in coverage into additional skill families and keep normalization/review flows stable across all session types.
3. **Authored lesson depth:** deepen lesson-pack assets for the highest-traffic skills already surfaced by review/quick-win flows, using `packages/curriculum/src/lesson-assets.mjs` and learner review rendering rather than inventing a new instruction system.
4. **Release-discipline follow-through:** update generated audit snapshot + narrative audit + content guide together whenever realism claims move.

### Acceptance criteria
- The generated audit and narrative audit continue to agree after any realism/content change.
- Release bars remain explicit and continue passing through `npm run audit:helix:bars`.
- Review lesson packs expose richer authored teaching steps for the targeted skills without breaking `tests/review-lesson-pack.test.mjs`.
- If module shape changes, smoke/API/tests all reflect the new counts and wording in one slice; if shape does not change yet, docs continue to state the limitation plainly.

### Key risk
This lane is the easiest place to overclaim. Docs must only move when the shipped item bank, selector, review assets, and tests already support the new realism statement.

## Recommended sequencing

### Wave 1 — Contract freeze first
Ship lane 1 first, because lane 2 and lane 3 both depend on stable learner-surface contracts.

### Wave 2 — QA hardening second
Once contracts are frozen, extend the smoke runner and audit assertions in lane 2 so the private-beta path becomes regression-resistant.

### Wave 3 — Realism/content depth third
Use the lane-2 guardrails to land lane-3 realism improvements incrementally without losing trust in activation or dashboard behavior.

## Parallelization guidance
- **Parallel-safe:** lane 1 schema extraction and lane 3 content/lesson-depth work can run in parallel after agreeing on contract names.
- **Serial dependency:** lane 2 should start after lane 1 defines the final learner-surface payload names/fields that smoke checks depend on.
- **Docs sync:** all lanes should batch truth-layer updates (`README.md`, `docs/sat-coverage-audit.md`, `docs/audits/project-helix-sat-coverage.md`, `content/README.md`) into the same PR wave as the underlying runtime change.

## Suggested PR breakdown
1. **PR A — Learner contract freeze**
   - schema extraction + validation composition cleanup + contract tests
2. **PR B — Activation/browser QA hardening**
   - smoke-runner improvements + QA docs + selector contract notes
3. **PR C — Realism/content-depth slice**
   - module/grid-in/lesson-depth improvements + audit/docs truth updates

## Verification plan
- `npm run check:schemas`
- `npm test`
- `npm run audit:helix`
- `npm run audit:helix:bars`
- `npm run check:docs-truth`
- `npm run smoke:learner` for any PR that touches learner flow, selectors, wording assumptions, or module counts

## Risks to flag early
1. **Schema drift risk:** `validation.mjs` and `packages/schemas/` can diverge if extraction is partial.
2. **Selector brittleness risk:** smoke coverage depends on stable DOM IDs named in `apps/web/README.md`.
3. **Audit honesty risk:** realism docs can get ahead of shipped counts very easily.
4. **Single-file UI risk:** `apps/web/public/app.js` still owns too much view logic, so each lane should resist opportunistic refactors outside the targeted slice.

## Definition of done for the private-beta slice
- Learner contracts are frozen in shared schema files.
- Browser QA covers the intended activation-to-dashboard path end to end.
- The next realism/content-depth slice improves the strongest remaining audit bottleneck without breaking audit honesty, release bars, or the one-next-action learner surface.
