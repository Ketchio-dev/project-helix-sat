# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT now **covers the full ontology slice in its shipped audit**, but the product still **falls short of stronger Bluebook-style fidelity claims** because module structure remains intentionally short and the item bank is still dominated by multiple-choice interactions.

## Evidence gathered

### Demo item bank
- 76 demo items total
- 33 Reading/Writing items, 43 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (8), information and ideas (8), expression of ideas (11), standard English conventions (6)
  - Math: algebra (13), advanced math (10), problem solving and data analysis (5), geometry and trigonometry (15)
- 76/76 items have canonical rationales and hint ladders
- 19 ontology skills are tracked in the audit: **19 covered, 0 partial, 0 missing**
- The latest deepening pass added six hand-authored math items:
  - linear equations / inequalities: +2
  - area / perimeter / circles: +2
  - right-triangle trigonometry: +2

### Format realism
- 11 Math items now use `grid_in`
- The bank still remains mostly `single_select`, so numeric-entry realism is present but not yet dominant
- The app supports end-to-end review/retry flows for both multiple-choice and numeric-entry items

### App flow
- Learner dashboard loads profile, plan, review recommendations, curriculum path, and latest session summaries
- First-run diagnostic now runs as a **13-item baseline** across both sections to seed reveal, next-best-action, and the first curriculum sprint
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow runs as a 10-item section-specific exam block and persists section/domain breakdowns to dashboard/history
- Completed sessions in history expose **Review Session** actions backed by `/api/session/review`
- Review now includes teach cards, worked examples, retry loops, and near-transfer follow-up

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `docs/audits/project-helix-sat-coverage.md` is the generated audit truth layer and should stay in sync with content changes
- This narrative audit should remain conservative until module realism and authored lesson depth materially improve

## Weakest current coverage

1. **Module simulation is still unlike a real digital SAT module.**
   - It is section-separated and 10 items long, which is still much shorter than a real SAT module.
2. **Format realism is still bounded.**
   - 11 Math items use `grid_in`, but most shipped items still use `single_select`.
3. **Lesson assets are stronger but still not fully authored curriculum objects.**
   - Many remediation surfaces still derive from curriculum metadata plus rationales rather than deeply authored teaching content.

## Major risks

1. **The product still uses one dominant item interaction pattern.**
   - Numeric-entry support is now credible, but multiple choice still dominates the bank.
2. **Module simulation still compresses structure too aggressively.**
   - Ten section-specific items are better for realism than the earlier slice, but still not enough to feel like a true SAT module.
3. **Curriculum explanation is ahead of authored instruction.**
   - The product can explain why a skill matters and route learners into repair loops, but many teach/worked-example surfaces are still scaffolded from canonical rationale content.

## Recommended next fixes

1. Raise section-specific module length beyond the current 10 items toward a more exam-realistic shape.
2. Expand the current 11-item math grid-in / student-produced-response slice so format realism is no longer a narrow subset.
3. Continue turning remediation surfaces from rationale-backed scaffolds into richer authored lesson assets.
4. Keep iterating on prompt quality so future generated items stay closer to Bluebook/Khan substance without overclaiming runtime parity.

## Bottom line

Today the product is a believable **two-section SAT prototype** with a 76-item bank, full ontology-slice coverage in the audit, an 11-item math numeric-entry slice, wired review/remediation flows, a 13-item onboarding baseline diagnostic, and section-specific 10-item modules. It is much stronger as a curriculum-backed adaptive product than it was a few slices ago, but it still needs more format breadth, longer modules, and richer authored instruction before any stronger Bluebook-parity claim would be justified.
