import { createDemoData, DEMO_USER_ID } from '../../../services/api/src/demo-data.mjs';
import { createStore } from '../../../services/api/src/store.mjs';

export const CORE_JOURNEY_ENDPOINTS = [
  '/api/session/active',
  '/api/diagnostic/start',
  '/api/attempt/submit',
  '/api/review/recommendations',
  '/api/reflection/submit',
  '/api/tutor/hint',
  '/api/timed-set/start',
  '/api/timed-set/finish',
  '/api/module/start',
  '/api/module/finish',
  '/api/dashboard/learner',
];

export const EXPOSED_AUDIT_ENDPOINTS = [...CORE_JOURNEY_ENDPOINTS, '/api/session/review'];

const ONTOLOGY_SKILL_ALIASES = {
  reading_writing: {
    central_ideas_and_details: ['rw_central_ideas_and_details'],
    inferences: ['rw_inferences'],
    command_of_evidence: ['rw_command_of_evidence'],
    words_in_context: ['rw_words_in_context'],
    text_structure_and_purpose: ['rw_text_structure_and_purpose'],
    cross_text_connections: ['rw_cross_text_connections'],
    rhetorical_synthesis: ['rw_rhetorical_synthesis'],
    organization: ['rw_transitions'],
    sentence_boundaries: ['rw_sentence_boundaries'],
    form_structure_and_sense: ['rw_form_structure_sense'],
    punctuation: ['rw_punctuation'],
  },
  math: {
    linear_equations_and_inequalities: ['math_linear_equations'],
    linear_functions: ['math_linear_functions', 'math_systems_of_linear_equations'],
    nonlinear_equations: ['math_nonlinear_equations', 'math_quadratic_functions', 'math_polynomial_rational'],
    nonlinear_functions: ['math_quadratic_functions'],
    ratios_rates_and_proportions: ['math_ratios_rates'],
    statistics_and_probability: ['math_statistics_probability'],
    area_volume_and_lines: ['math_area_and_perimeter', 'math_circles'],
    right_triangle_trigonometry: ['math_trigonometry'],
  },
};

const SEMANTIC_GAP_SKILLS = new Set([
  'reading_writing:organization',
  'math:linear_equations_and_inequalities',
  'math:nonlinear_functions',
  'math:area_volume_and_lines',
  'math:right_triangle_trigonometry',
]);

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toObject(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function totalMappedItems(skillCounts, aliases) {
  return aliases.reduce((sum, alias) => sum + (skillCounts.get(alias) ?? 0), 0);
}

export function buildContentSummary(items, rationales) {
  const sectionCounts = new Map();
  const domainCounts = new Map();
  const skillCounts = new Map();
  const itemFormatCounts = new Map();

  for (const item of items) {
    incrementCount(sectionCounts, item.section);
    incrementCount(domainCounts, `${item.section}:${item.domain}`);
    incrementCount(skillCounts, item.skill);
    incrementCount(itemFormatCounts, item.item_format ?? 'unknown');
  }

  const singletonSkills = [...skillCounts.entries()]
    .filter(([, count]) => count === 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([skill, count]) => ({ skill, count }));

  return {
    itemCount: items.length,
    rationaleCount: Object.keys(rationales).length,
    sectionCounts: toObject(sectionCounts),
    domainCounts: toObject(domainCounts),
    skillCounts: toObject(skillCounts),
    itemFormatCounts: toObject(itemFormatCounts),
    singletonSkills,
  };
}

function countItemFormats(items) {
  const counts = new Map();
  for (const item of items) {
    incrementCount(counts, item.item_format ?? 'unknown');
  }
  return toObject(counts);
}

export function buildFormatRealismAudit(items) {
  const mathGridInFormats = new Set(['grid_in', 'student_produced_response', 'student-produced-response']);
  return {
    allSingleSelect: items.every((item) => item.item_format === 'single_select'),
    hasMathGridIn: items.some((item) => item.section === 'math' && mathGridInFormats.has(item.item_format)),
    mathGridInCount: items.filter((item) => item.section === 'math' && mathGridInFormats.has(item.item_format)).length,
    itemFormatCounts: countItemFormats(items),
  };
}

export function buildOntologyCoverage(items, ontology) {
  const skillCounts = new Map();
  for (const item of items) {
    incrementCount(skillCounts, item.skill);
  }

  const skills = [];
  for (const section of ontology.sections ?? []) {
    for (const domain of section.domains ?? []) {
      for (const skill of domain.skills ?? []) {
        const aliases = ONTOLOGY_SKILL_ALIASES[section.section]?.[skill.skill] ?? [];
        const mappedItemCount = totalMappedItems(skillCounts, aliases);
        const status = mappedItemCount === 0
          ? 'missing'
          : mappedItemCount < 2 || SEMANTIC_GAP_SKILLS.has(`${section.section}:${skill.skill}`)
            ? 'partial'
            : 'covered';

        skills.push({
          section: section.section,
          domain: domain.domain,
          skill: skill.skill,
          aliases,
          mappedItemCount,
          status,
        });
      }
    }
  }

  return {
    totalSkills: skills.length,
    coveredSkills: skills.filter((entry) => entry.status === 'covered').length,
    partialSkills: skills.filter((entry) => entry.status === 'partial').length,
    missingSkills: skills.filter((entry) => entry.status === 'missing'),
    partialSkillDetails: skills.filter((entry) => entry.status === 'partial'),
    skills,
  };
}

function getSectionCounts(items) {
  const counts = new Map();
  for (const item of items) {
    incrementCount(counts, item.section);
  }
  return toObject(counts);
}

export function buildSessionAudit() {
  const diagnosticStore = createStore();
  const diagnostic = diagnosticStore.startDiagnostic();

  const timedStore = createStore();
  const timedSet = timedStore.startTimedSet();

  const moduleStore = createStore();
  const moduleSimulation = moduleStore.startModuleSimulation();

  const reviewStore = createStore();
  const reviewSession = reviewStore.startTimedSet();
  let reviewGateBlocksUntilCompletion = false;
  try {
    reviewStore.getSessionReview(reviewSession.session.id, DEMO_USER_ID);
  } catch {
    reviewGateBlocksUntilCompletion = true;
  }
  for (const item of reviewSession.items) {
    reviewStore.submitAttempt({
      itemId: item.itemId,
      selectedAnswer: 'A',
      sessionId: reviewSession.session.id,
      mode: 'exam',
      confidenceLevel: 3,
      responseTimeMs: 60000,
    });
  }
  const completedReview = reviewStore.getSessionReview(reviewSession.session.id, DEMO_USER_ID);

  return {
    diagnostic: {
      itemCount: diagnostic.items.length,
      sectionCounts: getSectionCounts(diagnostic.items),
    },
    timedSet: {
      itemCount: timedSet.items.length,
      examMode: Boolean(timedSet.session.exam_mode),
      timeLimitSec: timedSet.timing.timeLimitSec,
      sectionCounts: getSectionCounts(timedSet.items),
    },
    moduleSimulation: {
      itemCount: moduleSimulation.items.length,
      examMode: Boolean(moduleSimulation.session.exam_mode),
      timeLimitSec: moduleSimulation.timing.timeLimitSec,
      sectionCounts: getSectionCounts(moduleSimulation.items),
    },
    sessionReview: {
      blockedUntilCompletion: reviewGateBlocksUntilCompletion,
      reviewItemCount: completedReview.items.length,
    },
  };
}

function findMissingEndpoints(source, endpoints) {
  return endpoints.filter((endpoint) => !source.includes(endpoint));
}

export function buildAppFlowAudit({ routerSource, appSource, apiTestSource }) {
  const routerMissing = findMissingEndpoints(routerSource, CORE_JOURNEY_ENDPOINTS);
  const uiMissing = findMissingEndpoints(appSource, CORE_JOURNEY_ENDPOINTS);
  const apiTestMissing = findMissingEndpoints(apiTestSource, CORE_JOURNEY_ENDPOINTS);
  const exposedButUnused = EXPOSED_AUDIT_ENDPOINTS.filter((endpoint) => {
    if (!routerSource.includes(endpoint)) return false;
    return !appSource.includes(endpoint) && !apiTestSource.includes(endpoint);
  });

  return {
    routerMissing,
    uiMissing,
    apiTestMissing,
    exposedButUnused,
  };
}

export function buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource }) {
  const seed = createDemoData();
  const items = Object.values(seed.items ?? {});
  const rationales = seed.rationales ?? {};
  const content = buildContentSummary(items, rationales);
  const ontologyCoverage = buildOntologyCoverage(items, ontology);
  const sessions = buildSessionAudit();
  const appFlow = buildAppFlowAudit({ routerSource, appSource, apiTestSource });
  const formatRealism = buildFormatRealismAudit(items);

  const crossSectionCoverageCredible = Object.keys(content.sectionCounts).includes('reading_writing')
    && Object.keys(content.sectionCounts).includes('math')
    && Object.keys(content.domainCounts).length === 8
    && appFlow.routerMissing.length === 0
    && appFlow.uiMissing.length === 0
    && appFlow.apiTestMissing.length === 0;

  const blueprintCoverageComplete = ontologyCoverage.missingSkills.length === 0 && ontologyCoverage.partialSkills === 0;

  const majorRisks = [
    ...(ontologyCoverage.missingSkills.length
      ? [`Missing explicit blueprint skills: ${ontologyCoverage.missingSkills.map((entry) => `${entry.section}:${entry.skill}`).join(', ')}`]
      : []),
    ...(content.singletonSkills.length
      ? [`Thin item depth for singleton skills: ${content.singletonSkills.map((entry) => entry.skill).join(', ')}`]
      : []),
    ...(formatRealism.allSingleSelect
      ? ['All current items still use the same single_select format, so Bluebook-style format realism remains constrained even after this slice.']
      : []),
    ...(!formatRealism.hasMathGridIn
      ? ['Math still lacks any grid-in / student-produced-response item shape, which keeps SAT format realism intentionally incomplete.']
      : []),
    ...(sessions.moduleSimulation.itemCount < 8
      ? [`Module simulation is only ${sessions.moduleSimulation.itemCount} mixed-section items, so it does not resemble full SAT module length or section isolation.`]
      : []),
    ...(appFlow.exposedButUnused.length
      ? [`Exposed endpoints without UI/API-test usage: ${appFlow.exposedButUnused.join(', ')}`]
      : []),
  ];

  const nextFixes = [
    'Keep adding explicit punctuation items plus broader organization coverage in Reading/Writing.',
    'Continue deepening thin math areas, especially linear equations, circles, and trigonometry.',
    'Teach the app and audit path about grid-in / student-produced-response items before claiming stronger Bluebook format realism.',
    'Separate module simulations by section and increase item counts toward exam-realistic module shapes.',
    'Wire and regression-test /api/session/review if per-session postmortems are part of the intended learner flow.',
  ];

  return {
    content,
    ontologyCoverage,
    formatRealism,
    sessions,
    appFlow,
    verdict: {
      crossSectionCoverage: crossSectionCoverageCredible ? 'credible_for_mvp' : 'not_credible',
      blueprintCoverage: blueprintCoverageComplete ? 'complete' : 'incomplete',
    },
    majorRisks,
    nextFixes,
  };
}

export function formatProjectHelixSatAudit(audit) {
  const missingSkills = audit.ontologyCoverage.missingSkills.map((entry) => `- ${entry.section}/${entry.domain}/${entry.skill}`).join('\n') || '- none';
  const partialSkills = audit.ontologyCoverage.partialSkillDetails.map((entry) => `- ${entry.section}/${entry.domain}/${entry.skill} (${entry.mappedItemCount} mapped item${entry.mappedItemCount === 1 ? '' : 's'})`).join('\n') || '- none';
  const singletonSkills = audit.content.singletonSkills.map((entry) => `- ${entry.skill} (${entry.count} item)`).join('\n') || '- none';
  const majorRisks = audit.majorRisks.map((entry) => `- ${entry}`).join('\n') || '- none';
  const nextFixes = audit.nextFixes.map((entry) => `- ${entry}`).join('\n') || '- none';

  return `# Project Helix SAT coverage audit\n\n## Verdict\n- Cross-section coverage: ${audit.verdict.crossSectionCoverage}\n- Blueprint coverage: ${audit.verdict.blueprintCoverage}\n\n## Content coverage\n- Items: ${audit.content.itemCount}\n- Rationales: ${audit.content.rationaleCount}\n- Sections: ${Object.entries(audit.content.sectionCounts).map(([section, count]) => `${section}=${count}`).join(', ')}\n- Domains: ${Object.entries(audit.content.domainCounts).map(([domain, count]) => `${domain}=${count}`).join(', ')}\n- Formats: ${Object.entries(audit.content.itemFormatCounts).map(([format, count]) => `${format}=${count}`).join(', ')}\n\n## Blueprint alignment\n- Ontology skills: ${audit.ontologyCoverage.totalSkills}\n- Covered: ${audit.ontologyCoverage.coveredSkills}\n- Partial: ${audit.ontologyCoverage.partialSkills}\n- Missing: ${audit.ontologyCoverage.missingSkills.length}\n\n### Missing skills\n${missingSkills}\n\n### Partial skills\n${partialSkills}\n\n### Singleton item skills\n${singletonSkills}\n\n## Format realism\n- All items single_select: ${audit.formatRealism.allSingleSelect}\n- Math grid-in coverage present: ${audit.formatRealism.hasMathGridIn}\n- Math grid-in count: ${audit.formatRealism.mathGridInCount}\n\n## App flow evidence\n- Router missing core endpoints: ${audit.appFlow.routerMissing.length ? audit.appFlow.routerMissing.join(', ') : 'none'}\n- UI missing core endpoints: ${audit.appFlow.uiMissing.length ? audit.appFlow.uiMissing.join(', ') : 'none'}\n- API tests missing core endpoints: ${audit.appFlow.apiTestMissing.length ? audit.appFlow.apiTestMissing.join(', ') : 'none'}\n- Exposed but unused endpoints: ${audit.appFlow.exposedButUnused.length ? audit.appFlow.exposedButUnused.join(', ') : 'none'}\n\n## Session shapes\n- Diagnostic: ${audit.sessions.diagnostic.itemCount} items (${Object.entries(audit.sessions.diagnostic.sectionCounts).map(([section, count]) => `${section}=${count}`).join(', ')})\n- Timed set: ${audit.sessions.timedSet.itemCount} items, examMode=${audit.sessions.timedSet.examMode}, timeLimitSec=${audit.sessions.timedSet.timeLimitSec}\n- Module simulation: ${audit.sessions.moduleSimulation.itemCount} items, examMode=${audit.sessions.moduleSimulation.examMode}, timeLimitSec=${audit.sessions.moduleSimulation.timeLimitSec}, sections=${Object.entries(audit.sessions.moduleSimulation.sectionCounts).map(([section, count]) => `${section}=${count}`).join(', ')}\n- Session review gated until completion: ${audit.sessions.sessionReview.blockedUntilCompletion}\n\n## Major risks\n${majorRisks}\n\n## Next fixes\n${nextFixes}\n`;
}
