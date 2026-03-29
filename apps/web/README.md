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
