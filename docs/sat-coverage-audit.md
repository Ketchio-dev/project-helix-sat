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
  - authored lesson blueprints across the remaining Reading and Writing curriculum skills, bringing blueprint coverage across the current curriculum map to full coverage
  - a lesson-pack tier model that now marks every tracked skill as `middle` or `full`, with an 11-skill full-pack cohort for the highest-leverage remediation lanes
  - a longer module simulation shape for exam-mode practice

### Format realism
- 14 Math items now use `grid_in`
- Numeric-entry support is no longer a tiny edge path, though multiple choice still dominates the bank
- The app supports review/retry flows across both multiple-choice and numeric-entry items

### App flow
- First-run diagnostic remains a **13-item baseline** across both sections
- Timed sets still provide short exam-mode reps
- Module simulation still defaults to a **12-item** section-specific exam block
- The learner shell now also exposes **optional 18-item extended modules** for denser Reading/Writing and Math practice plus an **exam profile** at 27 Reading/Writing items / 22 Math items, while the standard audit snapshot stays on the default 12-item shape
- Recommended module CTAs now preserve the same section/profile metadata through launch, so the shell no longer labels one profile and silently starts another
- Completed sessions expose **Review Session** actions backed by `/api/session/review`
- Remediation cards now carry more authored teaching language, retry cues, revisit prompts, and a canonical lesson-arc summary instead of relying only on raw rationale summaries

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `npm run audit:helix:bars` enforces the current release bars (full blueprint coverage, 14 math grid-ins, zero singleton lanes, 12-item default module floor, and 2x section retake-resistance)
- `docs/audits/project-helix-sat-coverage.md` remains the generated truth layer and should move with content/session-shape changes
- This narrative audit should stay conservative until module length and authored lesson depth improve further

## Weakest current coverage

1. **Module simulation is still shorter than the real digital SAT.**
   - The default shipped module is still 12 items long, and the optional extended section profiles are only 18 items, so all paths remain materially shorter than a real SAT module.
2. **Format realism is broader but still bounded.**
   - 14 Math items use `grid_in`, and the shipped Math modules now force a repeated numeric-entry slice (3 grid-ins in the 12-question standard block, 5 in the 18-question extended block, 6 in the 22-question exam profile), but the overall bank is still mostly `single_select`.
3. **Authored lesson assets are stronger, but still not a full courseware system.**
   - The lesson system now gives every tracked skill a middle-pack scaffold and upgrades a smaller fixed cohort to full-pack depth, but the runtime still ships lightweight remediation bundles rather than long multi-day courseware sequences.

## Major risks

1. **The product still uses one dominant item interaction pattern.**
   - Numeric-entry support is now credible, but multiple choice still dominates the bank.
2. **Module simulation still compresses structure too aggressively.**
   - Twelve default section-specific items are easier to complete, and the new optional 18-item section profiles help, but none of the current paths yet feel like a true SAT module.
3. **Curriculum explanation is still ahead of full lesson depth.**
   - The product can now author middle/full lesson-pack remediation across the tracked curriculum, but it still needs deeper multi-step teaching assets if it wants to feel like a full curriculum system rather than a smart practice engine.

## Recommended next fixes

1. Raise section-specific module length beyond the current 12-item default / 18-item extended profiles toward a more exam-realistic shape.
2. Expand the current 14-item math grid-in / student-produced-response slice so format realism is no longer a minority path.
3. Continue turning the new middle/full lesson-pack layer into richer authored lesson assets with deeper multi-step instruction, not just stronger surface copy.
4. Keep iterating on prompt quality so future generated items stay closer to Bluebook/Khan substance without overclaiming runtime parity.

## Bottom line

Today the product is a believable **two-section SAT prototype** with a 79-item bank, full ontology-slice coverage in the audit, a 14-item math numeric-entry slice that now appears repeatedly inside shipped Math modules, authored remediation blueprints across the current curriculum map, an all-skill middle-pack lesson baseline plus an 11-skill full-pack cohort, a 13-item onboarding baseline diagnostic, a 12-item default module path, optional 18-item extended modules for both sections, and a larger exam profile at 27 Reading/Writing items / 22 Math items. It is much closer to a real curriculum-backed SAT product than it was a few slices ago, but module realism and deeper lesson depth are still the clearest next bottlenecks.
