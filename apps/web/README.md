# Learner web app

Primary SAT learning and exam-mode surface. Vanilla JS single-page app served
as static files — no framework, no build step, no design dependency chain.

## File map

| File | Purpose |
| --- | --- |
| `public/index.html` | Shell markup, auth shell, hero controls, section scaffolding |
| `public/styles.css` | Design tokens, layout system, cards, responsive behavior |
| `public/app.js` | State management, API calls, rendering, event binding |
| `public/learner-narrative.js` | Student-facing plan/projection language |
| `public/review-lesson-pack.js` | Review/remediation lesson-pack normalization |
| `public/teacher-view-model.js` | Thin support-surface view models |

## Learner design intent

- **No-AI-feel**: calm, credible SAT-prep product, not a glowing agent dashboard
- **One strong action at a time**: keep the main next move primary and everything
  else visually secondary
- **Editorial warmth over SaaS gloss**: soft paper-toned surfaces, muted navy
  accent, restrained motion
- **Progressive disclosure**: the learner can expand into the full dashboard, but
  the first screen should still read like a coaching surface

## Guardrails

1. Preserve existing element `id` attributes — `app.js` and Playwright smoke
   depend on them.
2. Prefer CSS-first changes for visual refreshes; avoid adding JS complexity for
   styling-only improvements.
3. Keep manual-start controls secondary to `next_best_action`.
4. Avoid remote font/CDN dependencies in the learner shell. The app should feel
   polished while remaining fully local and exam-safe.

## Private-beta browser QA path

- The **currently verified** private-beta browser path is the legacy learner shell
  in `apps/web/public/*`.
- The React shell is still a secondary development surface until it has parity
  browser coverage.
- `npm run smoke:learner` should report these explicit checkpoints:
  1. `signup_landing`
  2. `goal_setup_completion_resume`
  3. `diagnostic_preflight_start`
  4. `diagnostic_reveal_cta`
  5. `quick_win_completion_summary`
  6. `dashboard_review_visibility`
  7. `exam_profile_module_start`
- CI/browser smoke is expected to fail with the checkpoint name so regressions map
  to a concrete learner surface instead of a generic end-to-end failure.
- Smoke assertions should prefer stable `id` hooks, control values, and runtime
  metadata over long-form copy snapshots.

## Manual browser signoff still required

- final visual/copy sanity pass in the legacy learner shell
- grid-in/meta-chip sanity pass remains manual unless the UI exposes a stable
  non-copy selector for it
- exploratory React-shell parity check before promoting React to the beta path
- any cross-browser spot checks beyond the Chromium smoke lane
