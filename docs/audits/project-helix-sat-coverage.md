# Project Helix SAT coverage audit

## Verdict
- Cross-section coverage: credible_for_mvp
- Blueprint coverage: incomplete

## Content coverage
- Items: 47
- Rationales: 47
- Sections: math=21, reading_writing=26
- Domains: math:advanced_math=6, math:algebra=7, math:geometry_and_trigonometry=4, math:problem_solving_and_data_analysis=4, reading_writing:craft_and_structure=7, reading_writing:expression_of_ideas=5, reading_writing:information_and_ideas=8, reading_writing:standard_english_conventions=6

## Blueprint alignment
- Ontology skills: 19
- Covered: 15
- Partial: 4
- Missing: 0

### Missing skills
- none

### Partial skills
- math/algebra/linear_equations_and_inequalities (1 mapped item)
- math/advanced_math/nonlinear_functions (2 mapped items)
- math/geometry_and_trigonometry/area_volume_and_lines (3 mapped items)
- math/geometry_and_trigonometry/right_triangle_trigonometry (1 mapped item)

### Singleton item skills
- math_circles (1 item)
- math_linear_equations (1 item)
- math_trigonometry (1 item)

## App flow evidence
- Router missing core endpoints: none
- UI missing core endpoints: none
- API tests missing core endpoints: none
- Exposed but unused endpoints: /api/session/review

## Session shapes
- Diagnostic: 3 items (math=1, reading_writing=2)
- Timed set: 3 items, examMode=true, timeLimitSec=210
- Module simulation: 4 items, examMode=true, timeLimitSec=420, sections=math=2, reading_writing=2
- Session review gated until completion: true

## Major risks
- Thin item depth for singleton skills: math_circles, math_linear_equations, math_trigonometry
- Module simulation is only 4 mixed-section items, so it does not resemble full SAT module length or section isolation.
- Exposed endpoints without UI/API-test usage: /api/session/review

## Next fixes
- Deepen thin math areas with at least one additional item each for linear equations, circles, and trigonometry.
- Separate module simulations by section and increase item counts toward exam-realistic module shapes.
- Wire and regression-test /api/session/review if per-session postmortems are part of the intended learner flow.

