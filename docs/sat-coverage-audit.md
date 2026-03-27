# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT **credibly covers both SAT Reading/Writing and Math as a prototype vertical slice**, but the product still **falls short of stronger Bluebook-style fidelity claims** because format realism and module structure remain intentionally narrow.

## Evidence gathered

### Demo item bank
- 50 demo items total
- 26 Reading/Writing items, 24 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (7), information and ideas (8), expression of ideas (5), standard English conventions (6)
  - Math: algebra (8), advanced math (6), problem solving and data analysis (4), geometry and trigonometry (6)
- 50/50 items have canonical rationales and hint ladders
- 19 ontology skills are tracked in the audit: 14 covered, 5 partial, 0 missing
- There are no singleton-skill lanes anymore, but five blueprint areas are still explicitly partial:
  - organization
  - linear equations and inequalities
  - nonlinear functions
  - area, volume, and lines
  - right-triangle trigonometry

### App flow
- Learner dashboard loads profile, plan, review recommendations, and latest session summaries
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow now runs as a short 4-item section-specific exam block and persists section/domain breakdowns to dashboard/history
- Session history records timed-set and module-simulation outcomes
- Session review remains completion-gated, but `/api/session/review` is still not part of a stronger end-to-end learner path

### Documentation + tooling
- `npm run audit:helix` reproduces the current coverage snapshot
- `docs/audits/project-helix-sat-coverage.md` should stay aligned with the latest generated audit output
- `content/README.md` and this file should stay conservative until the app genuinely supports richer SAT item formats and section-shaped modules

## Weakest current coverage

1. **Format realism is still bounded.**
   - 3 Math items now use `grid_in`, but the rest of the bank still uses `single_select`.
   - The app/audit path has a real numeric-entry slice now, but it is still small and hand-authored.
2. **Module simulation is still unlike a real digital SAT module.**
   - It is now section-separated, but it remains only a 4-item block (`math=4` or `reading_writing=4`) instead of a real module-length section.
3. **Five blueprint lanes remain partial rather than fully stable.**
   - Reading/Writing organization is present but still thin.
   - Math linear equations, nonlinear functions, area/volume/lines, and right-triangle trigonometry still need more depth.
4. **Some shipped endpoints are still underused.**
   - `/api/session/review` is exposed by the API but still lacks UI and API-test usage.

## Major risks

1. **The product still uses one visible item interaction pattern.**
   - The bank now has a small numeric-entry slice, but most shipped items still use the same multiple-choice interaction pattern.
2. **Module simulation still compresses structure too aggressively.**
   - Four section-specific items are good enough to prove wiring, but not good enough to feel like a true SAT module.
3. **Coverage is broader than before but still not deep everywhere.**
   - Partial blueprint lanes are no longer missing, yet they remain too shallow for stronger adaptivity or retake-resistance claims.
4. **Review tooling is only partially surfaced.**
   - The API exposes per-session review, but the learner journey still does not emphasize it end to end.

## Recommended next fixes (slice 4, after `30f2588`)

1. Expand the current 3-item math grid-in / student-produced-response slice so format realism is no longer a token presence.
2. Deepen the five partial blueprint lanes (organization, linear equations and inequalities, nonlinear functions, area/volume/lines, right-triangle trigonometry) before making stronger coverage claims.
3. Raise section-specific module length closer to a real exam module (currently 4 items; target ≥ 8).
4. Wire and regression-test `/api/session/review` if post-session review is part of the intended learner workflow.
5. Improve content-generation prompt guidance so newly generated items stay closer to Bluebook/Khan quality without lying about current runtime limits.

## Bottom line

Today the product is a believable **two-section SAT prototype** with strong wiring across content, sessions, and dashboards. The next fidelity slice should focus on **blueprint depth, format realism, and prompt quality**, while keeping audits and docs explicit about what still is not Bluebook-parity yet.
