# Project Helix SAT — private-beta execution plan (canonical final)

Last updated: 2026-03-30
Owner lane: planner / worker-1

## Goal
Ship the next private-beta slice by closing the highest-risk repo-proven gaps in this order: **freeze learner product contracts**, **tighten browser QA over the actual activation journey**, then **land one honest realism/content-depth improvement slice**.

## Repo-grounded verdict
Private beta is **not blocked on missing core product machinery**. It is blocked on **surface hardening and honesty**:
- the main learner flow already exists in runtime, tests, docs, and smoke coverage;
- several private-beta contracts are still inline / partially undocumented;
- smoke coverage is strong for the legacy learner shell but still effectively one long happy path;
- realism/content depth is the clearest remaining product-trust gap.

## What is already done

### Product/runtime already present
- Auth, learner state, adaptive selection, diagnostic, timed-set, module, review, and dashboard surfaces exist: `services/api/src/router.mjs`, `services/api/src/store.mjs`, `README.md`.
- The router already exposes the critical learner endpoints:
  - `GET/POST /api/goal-profile`
  - `GET /api/next-best-action`
  - `GET /api/diagnostic/reveal`
  - `GET /api/plan/explanation`
  - `GET /api/projection/evidence`
  - `GET /api/reports/weekly`
  - `GET /api/review/recommendations`
  - `GET /api/dashboard/learner`
- Core learner product tests already exist in `tests/api.test.mjs` for goal setup, diagnostic reveal, weekly digest, session outcome, curriculum path, program path, and review retry loops.

### Contract foundation already present
- Shared schema files already exist for:
  - `plan_explanation`
  - `projection_evidence`
  - `weekly_report`
  - `learner_narrative`
  - `what_changed`
  - `curriculum_path`
  - `program_path`
- `services/api/src/validation.mjs` already loads package schemas and validates those shared surfaces.

### QA already present
- `scripts/run-playwright-learner-smoke.mjs` already covers:
  signup → goal setup → diagnostic preflight/start → reveal → quick win → dashboard expansion → review lesson-pack assertions → exam-profile module start.
- `tests/project-helix-sat-audit.test.mjs` already enforces that the smoke runner checks:
  duplicate IDs, review lesson-pack affordances, narrative copy, and exam-profile `0/22 answered` progress.

### Product-truth docs already present
- `docs/product-completion-milestones.md` already defines the three private-beta lanes and the contract-freeze list.
- `docs/sat-coverage-audit.md` and `README.md` already describe the current state honestly as **strong functionality with realism/depth gaps**.

## What is still missing

### 1) Contract freeze is incomplete
These private-beta contracts are still inline in `services/api/src/validation.mjs` instead of living as dedicated package schemas:
- `goal_profile` (`GoalProfileResponse`)
- `next_best_action` (`NextBestActionResponse`)
- `diagnostic_reveal` (`DiagnosticRevealResponse`)
- likely follow-on freeze candidates still nested/implicit in dashboard aggregation:
  - `session_outcome`
  - `review_remediation_card`
  - selected dashboard fragment leaves used by learner home/review

### 2) OpenAPI is behind the router
`services/api/openapi.yaml` includes `plan/explanation`, `projection/evidence`, `dashboard/learner`, and review/progress surfaces, but it does **not** currently document:
- `/api/goal-profile`
- `/api/next-best-action`
- `/api/diagnostic/reveal`

### 3) Browser QA is strong but still too monolithic
The smoke runner is already valuable, but failures still come from one large path rather than clearly separated beta checkpoints. The next step is hardening, not replacement.

### 4) React shell coverage is behind the legacy learner shell
`apps/web-react/src/store.js` consumes `goal-profile`, `next-best-action`, `learner-narrative`, and dashboard data, but current repo evidence still points private-beta browser coverage at the **legacy shell** (`apps/web/public/*`) rather than the React shell. The React shell is therefore not yet the verified beta path.

### 5) Realism/content depth is still the main trust bottleneck
Per `docs/sat-coverage-audit.md`, the clearest remaining product gaps are:
- default modules still short of exam realism,
- grid-in realism still minority-path,
- authored lesson depth still partial.

---

## Ranked next 3 implementation slices

## Slice 1 — Freeze learner product contracts and align OpenAPI (**do first**)

### Why this is #1
This removes the biggest drift risk across router, store, legacy shell, React shell, tests, and docs.

### Exact contracts to freeze now
1. `goal_profile`
2. `next_best_action`
3. `diagnostic_reveal`

### Exact files
- `packages/schemas/README.md`
- `packages/schemas/learner/goal-profile.schema.json` **(new)**
- `packages/schemas/learner/next-best-action.schema.json` **(new)**
- `packages/schemas/learner/diagnostic-reveal.schema.json` **(new)**
- `services/api/src/validation.mjs`
- `services/api/src/router.mjs`
- `services/api/src/store.mjs`
- `services/api/openapi.yaml`
- `tests/api.test.mjs`
- `tests/foundation.test.mjs`

### Required work
- Move the three inline response schemas out of `validation.mjs` into `packages/schemas/learner/`.
- Make `validation.mjs` load those files instead of owning the canonical bodies inline.
- Add `/api/goal-profile`, `/api/next-best-action`, and `/api/diagnostic/reveal` to `services/api/openapi.yaml`.
- Add/extend foundation coverage so missing schema files or route docs fail loudly.
- Keep `services/api/src/store.mjs` as the canonical payload shaper and keep both UIs as consumers only.

### Acceptance criteria
- Dedicated JSON schema files exist for the three contracts above.
- Router response validation uses those shared schema files.
- OpenAPI documents the same routes the router already exposes.
- `tests/api.test.mjs` still passes for goal setup + next-best-action + diagnostic reveal flows.
- `tests/foundation.test.mjs` explicitly guards the new schema files and OpenAPI route presence.

### Verification
- `npm run check:schemas`
- `node --test tests/api.test.mjs`
- `node --test tests/foundation.test.mjs`

---

## Slice 2 — Harden browser QA into explicit private-beta checkpoints (**do second**)

### Why this is #2
The activation path already exists and already has smoke coverage; the missing leverage is better failure localization and clearer beta guardrails.

### Exact files
- `scripts/run-playwright-learner-smoke.mjs`
- `apps/web/public/index.html`
- `apps/web/public/app.js`
- `apps/web/public/styles.css`
- `apps/web/public/learner-narrative.js`
- `apps/web/public/review-lesson-pack.js`
- `apps/web/README.md`
- `tests/project-helix-sat-audit.test.mjs`
- `README.md` *(only if the verified beta path statement changes)*
- `docs/product-completion-milestones.md` *(only if checkpoint wording needs sync)*

### Required work
- Restructure the smoke runner around named checkpoints:
  1. signup landing
  2. goal setup completion/resume
  3. diagnostic preflight/start
  4. diagnostic reveal CTA
  5. quick-win completion summary
  6. dashboard review visibility
  7. exam-profile module start
- Improve assertion messages so failures identify the broken surface.
- Preserve ID-based guardrails documented in `apps/web/README.md`.
- Decide explicitly whether private beta remains on `apps/web/public/*` for now; if yes, document React as non-primary until parity coverage exists.

### Acceptance criteria
- `npm run smoke:learner` still covers the full activation path end to end.
- Failures name the checkpoint, not just generic smoke failure.
- `tests/project-helix-sat-audit.test.mjs` stays aligned with the smoke-runner story.
- Docs clearly state what is automated versus what still needs manual browser signoff.

### Verification
- `npm run smoke:learner`
- `node --test tests/project-helix-sat-audit.test.mjs`
- `node --test tests/api.test.mjs`

---

## Slice 3 — Ship one narrow realism/content-depth win with audit/doc truth sync (**do third**)

### Why this is #3
This is the biggest remaining product-trust gap, but it should follow contract freeze and QA hardening so the learner surface is safer to evolve.

### Recommended scope inside Slice 3
Pick **one** of these, not all at once:
1. **module realism**: move one shipped module profile materially closer to believable SAT shape;
2. **authored remediation depth**: deepen the top review path’s teach-card / worked-example / retry / near-transfer quality;
3. **format realism**: expand grid-in coverage where audit impact is high and bounded.

### Exact files
- `docs/sat-coverage-audit.md`
- `docs/audits/project-helix-sat-coverage.md`
- `docs/quality/bluebook-khan-slice.md`
- `content/README.md`
- `packages/assessment/src/project-helix-sat-audit.mjs`
- `packages/assessment/src/item-selector.mjs`
- `packages/curriculum/src/lesson-assets.mjs`
- `services/api/src/store.mjs`
- `apps/web/public/review-lesson-pack.js`
- `apps/web/public/app.js`
- `scripts/audit-project-helix-sat.mjs`
- `scripts/check-content-release-bars.mjs`
- `tests/project-helix-sat-audit.test.mjs`
- `tests/review-lesson-pack.test.mjs`
- `tests/api.test.mjs`

### Acceptance criteria
- One documented realism/content bottleneck is materially improved.
- Audit output and narrative docs still match shipped reality.
- Review flow remains teach card → worked example → retry pair → near-transfer pair.
- No overclaiming beyond what runtime/tests/audit actually support.

### Verification
- `npm run audit:helix`
- `npm run audit:helix:bars`
- `npm run check:docs-truth`
- targeted `node --test` for touched review/audit/API files

---

## Explicit status by private-beta lane

### Lane 1 — learner-surface realism/cohesion
**Status:** partially done, not beta-frozen.
- Done: learner shell, narrative, next action, reveal, quick win, session outcome exist.
- Missing: frozen schema ownership for `goal_profile`, `next_best_action`, `diagnostic_reveal`; likely follow-on freeze for `session_outcome` and `review_remediation_card`.

### Lane 2 — authored lesson-pack/narrative cohesion
**Status:** meaningfully improved but still partial.
- Done: remediation cards, lesson-pack structure, learner narrative, weekly digest, and session outcome surfaces already exist.
- Missing: deeper authored lesson quality across the highest-traffic learner flows; tighter single-story vocabulary across reveal → quick win → review → dashboard.

### Lane 3 — browser QA expansion
**Status:** strong starting point, not yet fully hardened.
- Done: end-to-end Playwright smoke for the core learner path in the legacy shell.
- Missing: checkpointed failure localization, explicit manual signoff guidance, and a clear decision on React-shell beta readiness/parity coverage.

## Recommended PR / staffing sequence
1. **PR 1 — Contract freeze + OpenAPI alignment**
   - owner: executor (API/contracts)
2. **PR 2 — Browser QA hardening**
   - owner: executor or test-engineer
3. **PR 3 — Realism/content-depth slice + audit/doc sync**
   - owner: executor (content/product)
4. **Final verification pass**
   - owner: verifier

## Final recommended next action
Start with **Slice 1: contract freeze + OpenAPI alignment**.

That is the highest-leverage next move because it reduces drift for both UIs, makes browser QA safer to tighten, and brings docs/contracts/router back into one source-of-truth shape before more learner-surface work lands.

## Final verification bar for the whole private-beta slice
- `npm run check`
- `npm run smoke:learner`
- `npm run audit:helix:bars`
- `npm run check:docs-truth`

If those pass after Slices 1–3, the repo will have a materially stronger claim to private-beta readiness without widening scope into teacher/parent expansion.
