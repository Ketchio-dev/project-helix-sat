# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT **credibly covers both SAT Reading/Writing and Math as a prototype vertical slice**, but the product still **falls short of stronger Bluebook-style fidelity claims** because format realism and module structure remain intentionally narrow.

## Evidence gathered

### Demo item bank
- 66 demo items total
- 31 Reading/Writing items, 35 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (7), information and ideas (8), expression of ideas (7), standard English conventions (6)
  - Math: algebra (10), advanced math (7), problem solving and data analysis (4), geometry and trigonometry (9)
- 66/66 items have canonical rationales and hint ladders
- 19 ontology skills are tracked in the audit: 14 covered, 5 partial, 0 missing
- There are no singleton-skill lanes anymore, but five blueprint areas are still explicitly partial:
  - organization (rw_transitions): 6 items
  - linear equations and inequalities (math_linear_equations): 5 items
  - nonlinear functions (math_quadratic_functions): 4 items
  - area, volume, and lines (math_area_and_perimeter): 6 items
  - right-triangle trigonometry (math_trigonometry): 5 items

### Prompt-contract improvements (latest commit)
- Generation prompts for all five partial-coverage lanes now include materially stronger, testable realism constraints.
- **rw_transitions** boost now requires sentence-boundary realism, punctuation-aware transitions, and specific rhetorical precision.
- **Math weak lanes** now require inequality coverage, axis/vertex interpretation, composite-shape descriptions, angle-of-elevation contexts, and clean numeric results.
- Three new quality gates added: weak-blueprint verification (gate k), rw_transitions punctuation-context checking (gate l), and math numeric cleanliness (gate m).
- Regression tests verify all boost constraints are encoded in prompts.
- These improvements strengthen the generation contract for future item batches, and the current slice also adds new hand-authored items plus a wider numeric-entry/module path.

### App flow
- Learner dashboard loads profile, plan, review recommendations, and latest session summaries
- First-run diagnostic now runs as a **13-item baseline** across both sections to seed a more credible reveal and first personalized action
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow now runs as a 10-item section-specific exam block and persists section/domain breakdowns to dashboard/history
- Session history records timed-set and module-simulation outcomes
- Completed sessions in history now expose **Review Session** actions backed by `/api/session/review`
- Review remains completion-gated, but the learner path is now surfaced in the shipped web app instead of staying API-only

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `docs/audits/project-helix-sat-coverage.md` should stay aligned with the latest generated audit output
- `content/README.md` and this file should stay conservative until the app genuinely supports richer SAT item formats and section-shaped modules

## Weakest current coverage

1. **Format realism is still bounded.**
   - 7 Math items use `grid_in`, but the rest of the bank still uses `single_select`.
   - The app now has a real reviewable numeric-entry slice, but it is still small and hand-authored relative to the rest of the bank.
2. **Module simulation is still unlike a real digital SAT module.**
   - It is section-separated and 10 items long, but it still remains much shorter than a real module-length section.
3. **Five blueprint lanes remain partial rather than fully stable.**
   - Reading/Writing organization is better represented but still thin.
   - Math linear equations, nonlinear functions, area/volume/lines, and right-triangle trigonometry still need more depth before stronger blueprint claims are justified.

## Major risks

1. **The product still uses one dominant item interaction pattern.**
   - The bank has a small numeric-entry slice, but most shipped items still use multiple choice.
2. **Module simulation still compresses structure too aggressively.**
   - Ten section-specific items are materially better for realism, but still not enough to feel like a true SAT module.
3. **Coverage is broader than before but still not deep everywhere.**
   - The added content improves weak lanes, but item counts remain too low for stronger adaptivity or retake-resistance claims.
4. **Review flow is surfaced, but not yet rich.**
   - Session review is now wired into the web app, but the experience is still a lightweight post-session analysis layer rather than a fully developed remediation flow.

## Recommended next fixes (after prompt-contract improvements)

1. Generate or hand-author additional items for the five partial blueprint lanes using the stronger prompt constraints to deepen coverage.
2. Expand the current 7-item math grid-in / student-produced-response slice so format realism is no longer a narrow hand-authored slice.
3. Raise section-specific module length beyond the current 10 items toward a more exam-realistic shape.
4. Add richer review affordances on top of the newly wired session-review flow so remediation feels more like a deliberate learner loop.
5. Continue iterating on prompt quality to ensure newly generated items stay closer to Bluebook/Khan substance without overclaiming runtime parity.

## Bottom line

Today the product is a believable **two-section SAT prototype** with a 66-item bank, stronger weak-lane coverage, a 7-item math numeric-entry slice, wired session review, a 13-item onboarding baseline diagnostic, and section-specific 10-item modules. Even so, the product still needs more depth, more varied format coverage, and better calibration before any stronger Bluebook-parity claim would be justified.
