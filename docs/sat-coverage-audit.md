# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT **credibly covers both SAT Reading/Writing and Math as a prototype vertical slice**, but the product still **falls short of stronger Bluebook-style fidelity claims** because format realism and module structure remain intentionally narrow.

## Evidence gathered

### Demo item bank
- 55 demo items total
- 27 Reading/Writing items, 28 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (7), information and ideas (8), expression of ideas (5), standard English conventions (6)
  - Math: algebra (8), advanced math (6), problem solving and data analysis (4), geometry and trigonometry (6)
- 55/55 items have canonical rationales and hint ladders
- 19 ontology skills are tracked in the audit: 14 covered, 5 partial, 0 missing
- There are no singleton-skill lanes anymore, but five blueprint areas are still explicitly partial:
  - organization (rw_transitions): 4 items
  - linear equations and inequalities (math_linear_equations): 3 items
  - nonlinear functions (math_quadratic_functions): 3 items
  - area, volume, and lines (math_area_and_perimeter): 5 items
  - right-triangle trigonometry (math_trigonometry): 3 items

### Prompt-contract improvements (latest commit)
- Generation prompts for all five partial-coverage lanes now include materially stronger, testable realism constraints.
- **rw_transitions** boost now requires sentence-boundary realism, punctuation-aware transitions, and specific rhetorical precision.
- **Math weak lanes** now require inequality coverage, axis/vertex interpretation, composite-shape descriptions, angle-of-elevation contexts, and clean numeric results.
- Three new quality gates added: weak-blueprint verification (gate k), rw_transitions punctuation-context checking (gate l), and math numeric cleanliness (gate m).
- Regression tests verify all boost constraints are encoded in prompts.
- These improvements strengthen the generation contract for future item batches, and the current slice also adds new hand-authored items plus a wider numeric-entry/module path.

### App flow
- Learner dashboard loads profile, plan, review recommendations, and latest session summaries
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow now runs as an 8-item section-specific exam block and persists section/domain breakdowns to dashboard/history
- Session history records timed-set and module-simulation outcomes
- Session review remains completion-gated, but `/api/session/review` is still not part of a stronger end-to-end learner path

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `docs/audits/project-helix-sat-coverage.md` should stay aligned with the latest generated audit output
- `content/README.md` and this file should stay conservative until the app genuinely supports richer SAT item formats and section-shaped modules

## Weakest current coverage

1. **Format realism is still bounded.**
   - 5 Math items now use `grid_in`, but the rest of the bank still uses `single_select`.
   - The app/audit path has a real numeric-entry slice now, but it is still small and hand-authored relative to the rest of the bank.
2. **Module simulation is still unlike a real digital SAT module.**
   - It is now section-separated and 8 items long, but it still remains much shorter than a real module-length section.
3. **Five blueprint lanes remain partial rather than fully stable.**
   - Prompt guidance is now materially stronger for these lanes, but item count remains low.
   - Reading/Writing organization (transitions) is present but still thin.
   - Math linear equations, nonlinear functions, area/volume/lines, and right-triangle trigonometry still need more depth.
4. **Some shipped endpoints are still underused.**
   - `/api/session/review` is exposed by the API but still lacks UI and API-test usage.

## Major risks

1. **The product still uses one visible item interaction pattern.**
   - The bank now has a small numeric-entry slice, but most shipped items still use the same multiple-choice interaction pattern.
2. **Module simulation still compresses structure too aggressively.**
   - Eight section-specific items are materially better for realism, but still not enough to feel like a true SAT module.
3. **Coverage is broader than before but still not deep everywhere.**
   - Prompt guidance is now stronger for partial lanes, but item counts remain too low for stronger adaptivity or retake-resistance claims.
4. **Review tooling is only partially surfaced.**
   - The API exposes per-session review, but the learner journey still does not emphasize it end to end.

## Recommended next fixes (after prompt-contract improvements)

1. Generate or hand-author additional items for the five partial blueprint lanes using the new, stronger prompt constraints to deepen coverage.
2. Expand the current 5-item math grid-in / student-produced-response slice so format realism is no longer a narrow hand-authored slice.
3. Raise section-specific module length beyond the current 8 items toward a more exam-realistic shape.
4. Wire and regression-test `/api/session/review` if post-session review is part of the intended learner workflow.
5. Continue iterating on prompt quality to ensure newly generated items stay closer to Bluebook/Khan substance without overclaiming runtime parity.

## Bottom line

Today the product is a believable **two-section SAT prototype** with stronger prompt guidance, a deeper weak-lane item bank, a 5-item math numeric-entry slice, and section-specific 8-item modules. Even so, the product still needs more depth, more varied format coverage, and better calibration before any stronger Bluebook-parity claim would be justified.
