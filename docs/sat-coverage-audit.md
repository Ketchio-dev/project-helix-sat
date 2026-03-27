# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT now **covers the full ontology slice in its shipped audit** and has a noticeably stronger remediation surface, but the product still **falls short of stronger Bluebook-style fidelity claims** because module structure remains intentionally short relative to the real exam.

## Evidence gathered

### Demo item bank
- 79 demo items total
- 33 Reading/Writing items, 46 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (8), information and ideas (8), expression of ideas (11), standard English conventions (6)
  - Math: algebra (14), advanced math (10), problem solving and data analysis (7), geometry and trigonometry (15)
- 79/79 items have canonical rationales and hint ladders
- 19 ontology skills are tracked in the audit: **19 covered, 0 partial, 0 missing**
- The latest slice added:
  - three new math grid-in items across linear functions, ratios/rates, and statistics/probability
  - stronger authored lesson phrasing for inference, linear-equation, geometry, and trigonometry remediation
  - a longer module simulation shape for exam-mode practice

### Format realism
- 14 Math items now use `grid_in`
- Numeric-entry support is no longer a tiny edge path, though multiple choice still dominates the bank
- The app supports review/retry flows across both multiple-choice and numeric-entry items

### App flow
- First-run diagnostic remains a **13-item baseline** across both sections
- Timed sets still provide short exam-mode reps
- Module simulation now runs as a **12-item** section-specific exam block
- Completed sessions expose **Review Session** actions backed by `/api/session/review`
- Remediation cards now carry more authored teaching language instead of relying only on raw rationale summaries

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `docs/audits/project-helix-sat-coverage.md` remains the generated truth layer and should move with content/session-shape changes
- This narrative audit should stay conservative until module length and authored lesson depth improve further

## Weakest current coverage

1. **Module simulation is still shorter than the real digital SAT.**
   - It is now 12 items long, but that is still materially shorter than a real SAT module.
2. **Format realism is broader but still bounded.**
   - 14 Math items use `grid_in`, but the shipped bank is still mostly `single_select`.
3. **Authored lesson assets are still a partial layer, not a full courseware system.**
   - The remediation loop is stronger, but many lesson objects are still scaffolded from curriculum metadata plus canonical rationale content.

## Major risks

1. **The product still uses one dominant item interaction pattern.**
   - Numeric-entry support is now credible, but multiple choice still dominates the bank.
2. **Module simulation still compresses structure too aggressively.**
   - Twelve section-specific items are better than the previous slice, but still not enough to feel like a true SAT module.
3. **Curriculum explanation is ahead of authored instruction.**
   - The product can explain and route learners well, but it still needs deeper authored teaching assets if it wants to feel like a full curriculum system rather than a smart practice engine.

## Recommended next fixes

1. Raise section-specific module length beyond the current 12 items toward a more exam-realistic shape.
2. Expand the current 14-item math grid-in / student-produced-response slice so format realism is no longer a minority path.
3. Continue turning remediation surfaces from rationale-backed scaffolds into richer authored lesson assets across more skills.
4. Keep iterating on prompt quality so future generated items stay closer to Bluebook/Khan substance without overclaiming runtime parity.

## Bottom line

Today the product is a believable **two-section SAT prototype** with a 79-item bank, full ontology-slice coverage in the audit, a 14-item math numeric-entry slice, stronger authored remediation cards, a 13-item onboarding baseline diagnostic, and 12-item section-specific modules. It is much closer to a real curriculum-backed SAT product than it was a few slices ago, but module realism and deeper authored instruction are still the clearest next bottlenecks.
