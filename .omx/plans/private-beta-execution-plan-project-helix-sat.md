# Project Helix SAT — repo-grounded private-beta execution plan

Last updated: 2026-03-30
Owner lane: planner / task-2

## Evidence snapshot

Repo inspection shows the private-beta slice is already partially scaffolded but not yet contract-frozen end to end:

- `docs/product-completion-milestones.md` already defines the three-lane private-beta slice and lists the product contracts to freeze.
- `services/api/src/router.mjs` already exposes `GET/POST /api/goal-profile`, `GET /api/next-best-action`, `GET /api/diagnostic/reveal`, and the evidence endpoints.
- `services/api/src/validation.mjs` still keeps `GoalProfileResponse`, `NextBestActionResponse`, `DiagnosticRevealResponse`, and large portions of `DashboardLearnerResponse` inline instead of moving them into `packages/schemas/`.
- `services/api/openapi.yaml` documents `plan_explanation`, `projection_evidence`, `what_changed`, and `learner_narrative`, but it does **not** yet document `/api/goal-profile`, `/api/next-best-action`, or `/api/diagnostic/reveal`.
- Browser smoke already covers most of the learner journey in `scripts/run-playwright-learner-smoke.mjs`, including signup, goal setup, diagnostic, quick win, dashboard expansion, review lesson-pack assertions, and exam-profile module start (`0/22 answered`).
- The strongest remaining realism gaps are still called out in `docs/sat-coverage-audit.md` and `packages/assessment/src/project-helix-sat-audit.mjs`: short default module shape, format-realism still minority-path, and authored lesson depth still partial.

## Recommended execution shape

Use a short dependency-ordered sequence, then run the three lanes in parallel where safe:

1. **Stage 0 — contract freeze** (must land first)
2. **Lane A — browser QA expansion / hardening**
3. **Lane B — learner realism + content-depth improvements**
4. **Stage 1 — audit/doc truth refresh + release-bar verification**

Reason: the QA lane and realism lane both become cheaper and safer once the learner-facing contracts are explicit and documented.

---

## Stage 0 — learner product contract freeze gaps

### Why this is first
The repo already treats these payloads as product contracts in docs, but the implementation is split across inline validation objects, route handlers, and dashboard aggregation. That makes downstream UI and smoke work more brittle than necessary.

### Concrete files
- `services/api/src/validation.mjs`
- `packages/schemas/README.md`
- `packages/schemas/planning/` (add contract JSON files)
- `packages/schemas/reporting/` (add diagnostic reveal contract if grouped here)
- `services/api/openapi.yaml`
- `services/api/src/router.mjs`
- `services/api/src/store.mjs`
- `tests/api.test.mjs`
- `tests/project-helix-sat-audit.test.mjs`

### Specific freeze targets
1. Extract `GoalProfileResponse` out of `validation.mjs` into `packages/schemas/...`.
2. Extract `NextBestActionResponse` out of `validation.mjs` into `packages/schemas/...`.
3. Extract `DiagnosticRevealResponse` out of `validation.mjs` into `packages/schemas/...`.
4. Reduce `DashboardLearnerResponse` drift by replacing loose inline object leaves with reusable refs where practical.
5. Add `/api/goal-profile`, `/api/next-best-action`, and `/api/diagnostic/reveal` to `services/api/openapi.yaml`.
6. Keep `services/api/src/store.mjs` as the canonical payload shaper; UI remains rendering-only.

### Acceptance criteria
- JSON schema files exist for the frozen learner contracts and are loaded by `validation.mjs`.
- OpenAPI covers the same learner-product routes that the router already exposes.
- `tests/api.test.mjs` verifies the contract routes directly, not only via dashboard nesting.
- Dashboard aggregation still validates without duplicating contract logic.
- No new dependencies.

### Risks
- Over-normalizing `DashboardLearnerResponse` could create a wide diff; keep reuse surgical.
- Schema file placement can drift if planning vs reporting ownership is unclear; pick one convention and document it in `packages/schemas/README.md`.

---

## Lane A — browser QA expansion across the full activation path

### Goal
Turn the existing smoke runner into the canonical private-beta activation guardrail for:
signup → goal setup → diagnostic start → reveal → quick win → dashboard review → exam-profile module start.

### Concrete files
- `scripts/run-playwright-learner-smoke.mjs`
- `package.json`
- `apps/web/public/index.html`
- `apps/web/public/app.js`
- `apps/web/public/styles.css`
- `apps/web/public/learner-narrative.js`
- `apps/web/public/review-lesson-pack.js`
- `tests/project-helix-sat-audit.test.mjs`
- `README.md`
- `docs/product-completion-milestones.md`

### Work items
1. Keep the runner focused on one deterministic happy path, but add clearer assertions around each handoff boundary:
   - post-signup landing surface
   - goal setup persistence
   - diagnostic preflight visibility
   - reveal CTA into the recommended next action
   - quick-win completion summary
   - dashboard detail expansion
   - review lesson-pack actions
   - exam-profile module start with section-specific progress copy
2. Add guardrail assertions for the surfaces most likely to regress during UI work:
   - stable IDs
   - primary CTA visibility
   - hidden-by-default dashboard detail sections
   - review action button presence
   - exam-profile item-count copy (`0/22 answered` for math exam profile)
3. Keep smoke-runner output actionable so failures point to the broken surface instead of a generic browser failure.

### Acceptance criteria
- `npm run smoke:learner` passes locally from a clean state.
- The smoke runner explicitly proves each activation checkpoint listed in the task brief.
- `tests/project-helix-sat-audit.test.mjs` stays aligned with smoke-runner expectations and route/story claims.
- Learner-shell guardrails in `apps/web/README.md` remain true.

### Risks
- Copy-sensitive selectors can make smoke brittle; prefer stable ids/roles and regexes over long exact strings where possible.
- Visual redesign work can break smoke indirectly by changing hidden/visible defaults; keep those expectations deliberate and documented.

---

## Lane B — next highest-leverage realism / content-depth improvements

### Goal
Improve the surfaces most likely to affect private-beta trust without broadening scope into a full curriculum rewrite.

### Highest-leverage targets from repo evidence
1. **Module realism** — `docs/sat-coverage-audit.md` and `packages/assessment/src/project-helix-sat-audit.mjs` still flag the short module shape as the clearest realism gap.
2. **Authored remediation depth** — audit/docs still describe lesson assets as partial rather than fully authored.
3. **Learner-surface story cohesion** — the product-completion milestones explicitly call for a single consistent story across preflight, reveal, quick win, review, and dashboard surfaces.

### Concrete files
- `packages/assessment/src/project-helix-sat-audit.mjs`
- `packages/assessment/src/item-selector.mjs`
- `packages/assessment/src/daily-plan-generator.mjs`
- `services/api/src/store.mjs`
- `apps/web/public/app.js`
- `apps/web/public/learner-narrative.js`
- `apps/web/public/review-lesson-pack.js`
- `content/README.md`
- `docs/sat-coverage-audit.md`
- `docs/audits/project-helix-sat-coverage.md`
- `tests/api.test.mjs`
- `tests/project-helix-sat-audit.test.mjs`

### Recommended scope for this slice
- Prefer **exam-profile / extended-module realism improvements** before broad new content generation.
- Prefer **deeper authored teach card / worked example / retry pair / near-transfer pair quality** in the top learner flows before expanding into more secondary skills.
- Keep learner copy aligned around one next-action story; avoid adding more dashboard surface area.

### Acceptance criteria
- Audit output narrows at least one currently documented realism gap, or the docs are explicitly updated to preserve honest claims if the gap is intentionally deferred.
- The review/remediation flow keeps the teach card → worked example → retry pair → near-transfer pair progression intact.
- Any module-profile changes stay covered by API tests and smoke assertions.
- `docs/audits/project-helix-sat-coverage.md` remains generated truth if audit-visible behavior changes.

### Risks
- Chasing full SAT parity in this slice will blow scope; keep this to the next honest step, not total exam simulation parity.
- Generated-content expansion without stronger authored review can increase breadth faster than product conviction.

---

## Sequencing and staffing recommendation

### Recommended order
1. **Contract freeze PR**
2. **Parallel PRs**
   - PR A: browser QA hardening
   - PR B: realism/content-depth slice
3. **Truth-sync PR or final integration commit**
   - audit snapshot
   - docs truth
   - release-bar confirmation

### Suggested owner split
- **Executor 1:** contract extraction + OpenAPI alignment
- **Executor 2 / test engineer:** Playwright smoke expansion + audit assertions
- **Executor 3:** realism/content-depth implementation with audit/doc updates
- **Verifier:** final `npm run check`, `npm run smoke:learner`, `npm run audit:helix:bars`, `npm run check:docs-truth`

### Dependency notes
- Lane A depends on stable contract outputs and stable UI ids/text anchors.
- Lane B can begin analysis in parallel, but any learner-surface wording changes should merge after contract freeze to reduce churn.

---

## Verification plan for the slice

### Required commands
- `npm run check`
- `npm run smoke:learner`
- `npm run audit:helix:bars`
- `npm run check:docs-truth`

### PASS conditions
- All contract routes validate.
- Smoke passes across the full activation journey.
- Audit bars remain green.
- Docs do not overclaim beyond current runtime truth.

## Exit criteria for private-beta readiness in this slice

This slice is ready to hand off when:
- learner contracts are frozen and documented,
- browser QA covers the full private-beta activation path,
- realism/content-depth work reduces at least one top audit bottleneck without widening scope,
- release-bar and docs-truth checks pass.
