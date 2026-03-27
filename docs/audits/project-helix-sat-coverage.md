# Project Helix SAT coverage audit

## Verdict
- Cross-section coverage: credible_for_mvp
- Blueprint coverage: incomplete

## Content coverage
- Items: 55
- Rationales: 55
- Sections: math=28, reading_writing=27
- Domains: math:advanced_math=7, math:algebra=9, math:geometry_and_trigonometry=8, math:problem_solving_and_data_analysis=4, reading_writing:craft_and_structure=7, reading_writing:expression_of_ideas=6, reading_writing:information_and_ideas=8, reading_writing:standard_english_conventions=6
- Formats: grid_in=5, single_select=50

## Blueprint alignment
- Ontology skills: 19
- Covered: 14
- Partial: 5
- Missing: 0

### Missing skills
- none

### Partial skills
- reading_writing/expression_of_ideas/organization (4 mapped items)
- math/algebra/linear_equations_and_inequalities (3 mapped items)
- math/advanced_math/nonlinear_functions (3 mapped items)
- math/geometry_and_trigonometry/area_volume_and_lines (5 mapped items)
- math/geometry_and_trigonometry/right_triangle_trigonometry (3 mapped items)

### Singleton item skills
- none

## Format realism
- All items single_select: false
- Math grid-in coverage present: true
- Math grid-in count: 5

## App flow evidence
- Router missing core endpoints: none
- UI missing core endpoints: none
- API tests missing core endpoints: none
- Exposed but unused endpoints: /api/session/review

## Session shapes
- Diagnostic: 3 items (math=1, reading_writing=2)
- Timed set: 3 items, examMode=true, timeLimitSec=210
- Module simulation: 8 items, examMode=true, timeLimitSec=840, sections=math=8
- Session review gated until completion: true

## Major risks
- Exposed endpoints without UI/API-test usage: /api/session/review

## Next fixes
- Keep deepening partial Reading/Writing blueprint lanes (organization) with stronger hand-authored items or improved generation constraints before claiming broader coverage.
- Continue deepening linear_equations_and_inequalities, nonlinear_functions, area_volume_and_lines, right_triangle_trigonometry in Math with hand-authored depth or materially stronger prompt guidance before claiming full blueprint alignment.
- Expand grid-in / student-produced-response support beyond the current narrow math slice before claiming stronger Bluebook format realism.
- Wire and regression-test /api/session/review if they are part of the intended learner flow.

