# Learner web design review

Reviewed on 2026-03-29 after the learner-shell redesign pass.

## What improved

1. **Hero hierarchy is calmer**
   - The student now sees a clearer split between the main story and optional
     manual-start controls.
   - Refresh / logout / alternate starts no longer fight the main CTA.

2. **Auth shell feels like the same product**
   - Login/register now shares the same card system and spacing language as the
     learner dashboard.
   - The first screen reads like a study product instead of an admin form.

3. **Practice item readability is stronger**
   - Choice text wraps safely and no longer spills outside the option card.
   - The choice cards have clearer checked/hover states without looking noisy.

4. **Review is more believable**
   - The first review card and the lesson-pack details now have enough
     differentiation to feel like teaching, not raw payload dumps.

## Remaining design risks

1. **`app.js` still owns too much view logic**
   - Visual polish is improving faster than the file structure.
   - Further UI work will get harder until render/session/dashboard seams are
     split more cleanly.

2. **The learner surface still has many cards**
   - Progressive disclosure helps, but the full dashboard remains dense.
   - Future passes should keep tightening the “one narrative” feel between next
     action, plan explanation, projection evidence, and weekly digest.

3. **Visual QA is still mostly headless**
   - Playwright smoke now guards the redesign, but non-headless Safari/Chrome
     passes are still worth doing before a beta.

## Guardrails for future edits

- Do not reintroduce glossy bright-primary button clusters in the hero.
- Keep the strongest visual emphasis on one learner action at a time.
- Avoid generic AI-assistant wording or visual affordances.
- Preserve the local-only asset model; no remote fonts or ornamental embeds.
