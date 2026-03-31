import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../services/api/src/store.mjs';
import { projectScoreBand } from '../packages/scoring/src/score-predictor.mjs';
import { generateDailyPlan } from '../packages/assessment/src/daily-plan-generator.mjs';
import { buildCurriculumLessonBundle, FULL_PACK_REQUIRED_FIELDS, FULL_PACK_SKILL_IDS, getLessonBlueprint } from '../packages/curriculum/src/lesson-assets.mjs';
import { generateCurriculumPath, generateProgramPath } from '../packages/curriculum/src/path-generator.mjs';
import { inferSkillStage, getCurriculumSkill } from '../packages/curriculum/src/mastery-gates.mjs';
import { createEvent } from '../packages/telemetry/src/events.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createStateStorage } from '../services/api/src/state-storage.mjs';

const DEMO_USER_ID = 'demo-student';
const DEMO_ITEM_MAP = new Map(
  Object.values(createDemoData().items).map((item) => [item.itemId, item]),
);

function isStudentProducedResponse(item) {
  return ['grid_in', 'student_produced_response', 'student-produced-response'].includes(item?.item_format);
}

function buildAttemptPayload(item, sessionId, mode = 'exam') {
  if (isStudentProducedResponse(item)) {
    return {
      userId: DEMO_USER_ID,
      itemId: item.itemId,
      freeResponse: '11/2',
      sessionId,
      mode,
      confidenceLevel: 3,
      responseTimeMs: 60000,
    };
  }

  return {
    userId: DEMO_USER_ID,
    itemId: item.itemId,
    selectedAnswer: 'A',
    sessionId,
    mode,
    confidenceLevel: 3,
    responseTimeMs: 60000,
  };
}



async function withMockedNow(isoString, run) {
  const RealDate = Date;
  const fixed = new RealDate(isoString);
  global.Date = class extends RealDate {
    constructor(...args) {
      return args.length ? new RealDate(...args) : new RealDate(fixed);
    }

    static now() {
      return fixed.getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };

  try {
    return await run();
  } finally {
    global.Date = RealDate;
  }
}

function buildLearnAttemptPayload(userId, item, sessionId, { correct = true } = {}) {
  if (isStudentProducedResponse(item)) {
    const accepted = item.responseValidation?.acceptedResponses?.[0] ?? item.answerKey;
    return {
      userId,
      itemId: item.itemId,
      sessionId,
      mode: 'learn',
      confidenceLevel: 3,
      responseTimeMs: 35000,
      freeResponse: correct ? accepted : '0',
    };
  }

  const incorrectChoice = item.choices.find((choice) => choice.key !== item.answerKey)?.key ?? 'A';
  return {
    userId,
    itemId: item.itemId,
    sessionId,
    mode: 'learn',
    confidenceLevel: 3,
    responseTimeMs: 35000,
    selectedAnswer: correct ? item.answerKey : incorrectChoice,
  };
}

describe('integrity: exam mode does not leak correctAnswer', () => {
  it('submitAttempt in exam mode omits correctAnswer, distractorTag, projection, plan, errorDna, review', () => {
    const store = createStore();
    const timedSet = store.startTimedSet(DEMO_USER_ID);
    const result = store.submitAttempt(buildAttemptPayload(timedSet.items[0], timedSet.session.id));
    assert.equal('correctAnswer' in result, false, 'correctAnswer must not appear in exam mode response');
    assert.equal('distractorTag' in result, false, 'distractorTag must not appear in exam mode response');
    assert.equal('projection' in result, false, 'projection must not appear in exam mode response');
    assert.equal('plan' in result, false, 'plan must not appear in exam mode response');
    assert.equal('errorDna' in result, false, 'errorDna must not appear in exam mode response');
    assert.equal('review' in result, false, 'review must not appear in exam mode response');
  });
});

describe('integrity: learn mode still returns correctAnswer', () => {
  it('submitAttempt in learn mode includes correctAnswer', () => {
    const store = createStore();
    const diagnostic = store.startDiagnostic(DEMO_USER_ID);
    const result = store.submitAttempt({
      userId: DEMO_USER_ID,
      itemId: diagnostic.items[0].itemId,
      selectedAnswer: 'A',
      sessionId: diagnostic.session.id,
      mode: 'learn',
      confidenceLevel: 3,
      responseTimeMs: 45000,
    });
    assert.ok('correctAnswer' in result, 'correctAnswer must be present in learn mode response');
    assert.ok(typeof result.correctAnswer === 'string');
  });
});

describe('integrity: server timing — delivered_at is set on session items', () => {
  it('first session item has delivered_at set after buildSessionPayload', () => {
    const store = createStore();
    const timedSet = store.startTimedSet(DEMO_USER_ID);
    const sessionItems = store.getSessionItems(timedSet.session.id);
    assert.ok(sessionItems.length > 0, 'session must have items');
    assert.ok(sessionItems[0].delivered_at !== null, 'first item delivered_at must be set');
    assert.ok(typeof sessionItems[0].delivered_at === 'string', 'delivered_at must be a string timestamp');
  });
});

describe('integrity: server timing — attempt uses server-calculated time', () => {
  it('attempt record has both response_time_ms and client_response_time_ms', () => {
    const store = createStore();
    const timedSet = store.startTimedSet(DEMO_USER_ID);
    store.submitAttempt({
      ...buildAttemptPayload(timedSet.items[0], timedSet.session.id),
      responseTimeMs: 55000,
    });
    const attempts = store.getSessionAttempts(timedSet.session.id);
    assert.ok(attempts.length > 0, 'must have at least one attempt');
    const attempt = attempts[0];
    assert.ok('response_time_ms' in attempt, 'attempt must have response_time_ms');
    assert.ok('client_response_time_ms' in attempt, 'attempt must have client_response_time_ms');
    assert.ok(typeof attempt.response_time_ms === 'number');
    assert.ok(typeof attempt.client_response_time_ms === 'number');
  });
});

describe('integrity: score predictor — insufficient_evidence for empty input', () => {
  it('returns status insufficient_evidence and confidence 0 for empty array', () => {
    const result = projectScoreBand([]);
    assert.equal(result.status, 'insufficient_evidence');
    assert.equal(result.confidence, 0);
  });
});

describe('integrity: score predictor — low_evidence for small sample', () => {
  it('returns status low_evidence and confidence <= 0.45 for 1-2 low-signal skill states', () => {
    const skillState = {
      skill_id: 'math_linear',
      section: 'math',
      mastery: 0.5,
      timed_mastery: 0.5,
      retention_risk: 0.2,
      careless_risk: 0.1,
      confidence_calibration: 0.5,
      attempts_count: 1,
    };
    const result = projectScoreBand([skillState]);
    assert.equal(result.status, 'low_evidence');
    assert.equal(result.model_version, 'projection-v1-evidence-weighted');
    assert.ok(result.confidence <= 0.45, `confidence ${result.confidence} should be <= 0.45`);
  });
});

describe('integrity: daily plan — needs_diagnostic for empty skillStates', () => {
  it('returns status needs_diagnostic when skillStates is empty', () => {
    const result = generateDailyPlan({
      profile: { daily_minutes: 30 },
      skillStates: [],
      errorDna: {},
    });
    assert.equal(result.status, 'needs_diagnostic');
    assert.equal(result.planner_version, 'v1-curriculum-aware');
  });
});

describe('integrity: return-path slice adds comeback framing and study modes', () => {
  it('reframes the next step after inactivity and keeps short/standard/deep paths ready', () => {
    const store = createStore();
    const { user } = store.registerUser({
      name: 'Return Path Student',
      email: 'return-path@example.com',
      password: 'pass1234',
    });
    const userId = user.id;

    store.updateGoalProfile(userId, {
      targetScore: 1450,
      targetTestDate: '2026-10-10',
      dailyMinutes: 35,
      selfReportedWeakArea: 'inference',
    });

    const diagnostic = store.startDiagnostic(userId);
    for (const [index, item] of diagnostic.items.entries()) {
      const canonicalItem = DEMO_ITEM_MAP.get(item.itemId) ?? item;
      store.submitAttempt(buildLearnAttemptPayload(userId, canonicalItem, diagnostic.session.id, {
        correct: index !== 0,
      }));
    }

    const diagnosticSession = store.getSession(diagnostic.session.id);
    const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
    diagnosticSession.started_at = new Date(threeDaysAgo.getTime() - (12 * 60 * 1000)).toISOString();
    diagnosticSession.ended_at = threeDaysAgo.toISOString();

    const comebackState = store.getComebackState(userId);
    assert.equal(comebackState.isReturning, true);
    assert.ok(comebackState.daysAway >= 3);
    assert.match(comebackState.headline, /Welcome back/);

    const nextAction = store.getNextBestAction(userId);
    assert.equal(nextAction.kind, 'start_quick_win');
    assert.match(nextAction.title, /Get back in with a quick win|Restart gently with a quick win/);
    assert.match(nextAction.ctaLabel, /quick comeback/i);

    const dashboard = store.getDashboard(userId);
    assert.equal(dashboard.comebackState.isReturning, true);
    assert.equal(Array.isArray(dashboard.studyModes), true);
    assert.equal(dashboard.studyModes.length, 3);
    assert.deepEqual(dashboard.studyModes.map((mode) => mode.key), ['quick', 'standard', 'deep']);
    assert.ok(dashboard.studyModes.every((mode) => mode.action?.kind));
    assert.ok(dashboard.tomorrowPreview);
    assert.equal(typeof dashboard.tomorrowPreview.headline, 'string');
    assert.equal(typeof dashboard.tomorrowPreview.action?.kind, 'string');
  });
});

describe('integrity: score predictor — richer evidence raises confidence and keeps sections bounded', () => {
  it('uses attempts, recency, and session history to produce a tighter confident band', () => {
    const recentIso = new Date().toISOString();
    const result = projectScoreBand({
      targetScore: 1450,
      skillStates: [
        {
          skill_id: 'rw_inferences',
          section: 'reading_writing',
          mastery: 0.71,
          timed_mastery: 0.64,
          retention_risk: 0.24,
          careless_risk: 0.17,
          hint_dependency: 0.12,
          trap_susceptibility: 0.18,
          confidence_calibration: 0.63,
          attempts_count: 9,
          last_seen_at: recentIso,
        },
        {
          skill_id: 'math_linear_equations',
          section: 'math',
          mastery: 0.68,
          timed_mastery: 0.61,
          retention_risk: 0.29,
          careless_risk: 0.19,
          hint_dependency: 0.14,
          trap_susceptibility: 0.21,
          confidence_calibration: 0.6,
          attempts_count: 8,
          last_seen_at: recentIso,
        },
      ],
      sessionHistory: [
        { status: 'complete', accuracy: 0.78 },
        { status: 'complete', accuracy: 0.71 },
      ],
    });

    assert.equal(result.status, 'sufficient');
    assert.ok(result.confidence > 0.45);
    assert.ok(result.predicted_total_high - result.predicted_total_low <= 220);
    assert.ok(result.rw_low >= 200 && result.rw_high <= 800);
    assert.ok(result.math_low >= 200 && result.math_high <= 800);
  });
});

describe('integrity: curriculum stage inference', () => {
  it('maps weak skill snapshots into repair/practice stages and stable snapshots into mastered', () => {
    const linearSkill = getCurriculumSkill('math_linear_equations');
    assert.equal(inferSkillStage(null, linearSkill), 'unseen');
    assert.equal(inferSkillStage({
      skill_id: 'math_linear_equations',
      mastery: 0.35,
      timed_mastery: 0.3,
      careless_risk: 0.6,
      retention_risk: 0.4,
      confidence_calibration: 0.4,
      attempts_count: 3,
    }, linearSkill), 'foundation_repair');
    assert.equal(inferSkillStage({
      skill_id: 'math_linear_equations',
      mastery: 0.9,
      timed_mastery: 0.84,
      careless_risk: 0.12,
      retention_risk: 0.15,
      confidence_calibration: 0.7,
      attempts_count: 8,
    }, linearSkill), 'mastered');
  });
});

describe('integrity: curriculum lesson bundle', () => {
  it('turns curriculum lesson asset IDs into teach, worked-example, and transfer cards', () => {
    const seed = createDemoData();
    const workedExampleItem = seed.items.rw_inference_01;
    const transferItem = seed.items.rw_inference_02;
    const bundle = buildCurriculumLessonBundle({
      skillId: 'rw_inferences',
      workedExampleItem,
      workedExampleRationale: seed.rationales[workedExampleItem.itemId],
      retryItem: workedExampleItem,
      transferItem,
      transferRationale: seed.rationales[transferItem.itemId],
    });

    assert.equal(bundle.packDepth, 'full');
    assert.equal(bundle.teachCard.id, 'teach_rw_inferences_v1');
    assert.equal(bundle.workedExample.id, 'we_rw_inferences_1');
    assert.ok(bundle.workedExample.walkthrough.length >= 1);
    assert.equal(bundle.retryCard.id, 'retry_rw_inferences_v1');
    assert.equal(bundle.retryCard.itemId, workedExampleItem.itemId);
    assert.equal(bundle.transferCard.id, 'transfer_rw_inferences_v1');
    assert.equal(bundle.transferCard.itemId, transferItem.itemId);
    assert.match(bundle.teachCard.summary, /strongest claim the lines force/i);
    assert.match(bundle.teachCard.lookForFirst, /line that forces the claim/i);
    assert.match(bundle.teachCard.ruleOfThumb, /too big for SAT inference/i);
    assert.match(bundle.teachCard.successSignal, /concrete clues/i);
    assert.match(bundle.workedExample.walkthrough[0], /collect the concrete clues first/i);
    assert.match(bundle.workedExample.mistakePattern, /story-sized conclusion/i);
    assert.match(bundle.workedExample.contrastRule, /Wrong move/i);
    assert.match(bundle.retryCard.cue, /exact line first/i);
    assert.match(bundle.transferCard.transferGoal, /concrete clues/i);
    assert.match(bundle.transferCard.rationalePreview, /prove the answer from one or two exact clues/i);
    assert.match(bundle.transferCard.nearTransferCheck, /every word/i);
    assert.deepEqual(bundle.revisitPlan.dueInDays, [1, 3, 7, 14]);
    assert.match(bundle.revisitPlan.prompt, /cite the exact phrase/i);
    assert.match(bundle.lessonArc.summaryText, /Teach card · Worked example · Retry pair · Near-transfer pair · Revisit plan/i);
    assert.match(bundle.coachLanguage.coachLine, /prove the answer from the line/i);
    assert.match(bundle.coachLanguage.exitTicketPrompt, /exact words in the passage/i);
  });

  it('uses authored lesson phrasing for math repair skills instead of generic fallback copy', () => {
    const seed = createDemoData();
    const workedExampleItem = seed.items.math_linear_09;
    const transferItem = seed.items.math_linear_08;
    const bundle = buildCurriculumLessonBundle({
      skillId: 'math_linear_equations',
      workedExampleItem,
      workedExampleRationale: seed.rationales[workedExampleItem.itemId],
      transferItem,
      transferRationale: seed.rationales[transferItem.itemId],
    });

    assert.match(bundle.teachCard.summary, /write the full linear equation or inequality first/i);
    assert.match(bundle.teachCard.checkFor, /greatest or least valid answer/i);
    assert.match(bundle.teachCard.lookForFirst, /full equation or inequality/i);
    assert.match(bundle.teachCard.ruleOfThumb, /check the context rule/i);
    assert.equal(bundle.teachCard.commonTrap, 'Stopping after the algebra boundary without checking which answer actually satisfies the context.');
    assert.match(bundle.workedExample.takeaway, /setup is correct and the final bound is checked/i);
    assert.match(bundle.workedExample.mistakePattern, /valid maximum, minimum, or satisfying value/i);
    assert.match(bundle.transferCard.transferGoal, /verify the winning value/i);
    assert.match(bundle.transferCard.rationalePreview, /verify the requested maximum, minimum, or satisfying value/i);
  });

  it('extends authored lesson phrasing to additional high-value reading and math skills', () => {
    const seed = createDemoData();
    const cases = [
      {
        skillId: 'rw_transitions',
        workedExampleItem: seed.items.rw_transition_01,
        transferItem: seed.items.rw_transition_02,
        summaryPattern: /Transitions follow logic, not vibes/i,
        trapPattern: /wrong relationship/i,
        transferPattern: /relationship first/i,
        lookForPattern: /Contrast, continuation, example, cause, or concession/i,
        rulePattern: /Decide the logic first/i,
        mistakePattern: /sentence relationship/i,
        transferGoalPattern: /transition that names it exactly/i,
        fullPackCuePattern: /relationship first/i,
        fullPackContrastPattern: /smoothest transition by ear/i,
        fullPackCheckPattern: /exact relationship you named/i,
      },
      {
        skillId: 'rw_command_of_evidence',
        workedExampleItem: seed.items.rw_evidence_01,
        transferItem: seed.items.rw_evidence_02,
        summaryPattern: /receipts check/i,
        trapPattern: /related to the subject but does not actually prove/i,
        transferPattern: /justify the claim out loud/i,
      },
      {
        skillId: 'rw_sentence_boundaries',
        workedExampleItem: seed.items.rw_revision_01,
        transferItem: seed.items.rw_boundary_02,
        summaryPattern: /clause questions first/i,
        trapPattern: /comma splice, run-on, or fragment/i,
        transferPattern: /label the clauses first/i,
      },
      {
        skillId: 'rw_words_in_context',
        workedExampleItem: seed.items.rw_words_context_01,
        transferItem: seed.items.rw_words_context_02,
        summaryPattern: /precision questions/i,
        trapPattern: /everyday meaning of the word/i,
        transferPattern: /shade of meaning/i,
      },
      {
        skillId: 'rw_rhetorical_synthesis',
        workedExampleItem: seed.items.rw_rhetoric_01,
        transferItem: seed.items.rw_rhetoric_02,
        summaryPattern: /goal-first reading/i,
        trapPattern: /does not actually accomplish the stated writing goal/i,
        transferPattern: /assigned job/i,
      },
      {
        skillId: 'math_systems_of_linear_equations',
        workedExampleItem: seed.items.math_systems_02,
        transferItem: seed.items.math_systems_01,
        summaryPattern: /one situation told twice/i,
        trapPattern: /satisfies both relationships/i,
        transferPattern: /what the solution means/i,
      },
      {
        skillId: 'math_statistics_probability',
        workedExampleItem: seed.items.math_stats_03,
        transferItem: seed.items.math_stats_02,
        summaryPattern: /what the numbers represent/i,
        trapPattern: /population or event was read too loosely/i,
        transferPattern: /target statistic or event first/i,
      },
      {
        skillId: 'math_quadratic_functions',
        workedExampleItem: seed.items.math_quadratic_03,
        transferItem: seed.items.math_quadratic_04,
        summaryPattern: /structure questions/i,
        trapPattern: /aimed at the wrong feature/i,
        transferPattern: /requested feature easiest to see/i,
      },
      {
        skillId: 'math_polynomial_rational',
        workedExampleItem: seed.items.math_polynomial_01,
        transferItem: seed.items.math_polynomial_02,
        summaryPattern: /structure over speed/i,
        trapPattern: /zeros, factors, and excluded values/i,
        transferPattern: /root, a restriction, or an equivalent rewritten form/i,
      },
      {
        skillId: 'rw_central_ideas_and_details',
        workedExampleItem: seed.items.rw_central_ideas_01,
        transferItem: seed.items.rw_central_ideas_02,
        summaryPattern: /keeps returning to/i,
        trapPattern: /broader claim those details are building toward/i,
        transferPattern: /repeated pattern across the details/i,
        lookForPattern: /detail pattern the passage repeats/i,
        rulePattern: /too narrow for the main idea/i,
        mistakePattern: /umbrella claim/i,
        transferGoalPattern: /umbrella claim they all support/i,
      },
      {
        skillId: 'rw_text_structure_and_purpose',
        workedExampleItem: seed.items.rw_structure_01,
        transferItem: seed.items.rw_structure_02,
        summaryPattern: /what a sentence or paragraph is doing/i,
        trapPattern: /restates the sentence topic but mislabels its role/i,
        transferPattern: /what the line is doing in the passage/i,
        lookForPattern: /describe, explain, pivot, qualify, or argue/i,
        rulePattern: /role in the passage/i,
        mistakePattern: /job it performs in the surrounding structure/i,
        transferGoalPattern: /job in the passage/i,
      },
      {
        skillId: 'rw_cross_text_connections',
        workedExampleItem: seed.items.rw_cross_text_01,
        transferItem: seed.items.rw_cross_text_02,
        summaryPattern: /comparison questions/i,
        trapPattern: /overstates agreement, disagreement, or certainty/i,
        transferPattern: /state each author’s claim first/i,
        lookForPattern: /each author would say in one sentence/i,
        rulePattern: /Compare claims, not just shared topics/i,
        mistakePattern: /same subject in both texts and assume agreement/i,
        transferGoalPattern: /one concrete claim from each text/i,
      },
      {
        skillId: 'rw_form_structure_sense',
        workedExampleItem: seed.items.rw_form_structure_01,
        transferItem: seed.items.rw_form_structure_02,
        summaryPattern: /grammatically aligned and logically clear/i,
        trapPattern: /sounds natural in conversation/i,
        transferPattern: /true subject or antecedent before you pick the form/i,
        lookForPattern: /Agreement, pronoun reference, tense, or modifier logic/i,
        rulePattern: /matches the sentence structure/i,
        mistakePattern: /nearest noun/i,
        transferGoalPattern: /core structure/i,
      },
      {
        skillId: 'rw_punctuation',
        workedExampleItem: seed.items.rw_punctuation_01,
        transferItem: seed.items.rw_punctuation_02,
        summaryPattern: /relationship questions/i,
        trapPattern: /does not support that relationship/i,
        transferPattern: /attachment, separation, or explanation/i,
        lookForPattern: /Clause structure and the relationship/i,
        rulePattern: /structure and purpose/i,
        mistakePattern: /sounds strongest by ear/i,
        transferGoalPattern: /structural relationship first/i,
      },
      {
        skillId: 'math_area_and_perimeter',
        workedExampleItem: seed.items.math_geometry_02,
        transferItem: seed.items.math_geometry_03,
        summaryPattern: /Choose the measure before you calculate/i,
        trapPattern: /different geometric measure/i,
        transferPattern: /name the measure before you touch the numbers/i,
        lookForPattern: /perimeter, area, surface area, or volume/i,
        rulePattern: /decide what quantity is being measured/i,
        mistakePattern: /wrong geometric quantity/i,
        transferGoalPattern: /Name the measure and units first/i,
        fullPackCuePattern: /target measure first/i,
        fullPackContrastPattern: /familiar formula immediately/i,
        fullPackCheckPattern: /exact measure named in the prompt/i,
      },
      {
        skillId: 'math_linear_functions',
        workedExampleItem: seed.items.math_linear_func_01,
        transferItem: seed.items.math_linear_func_02,
        summaryPattern: /constant rate and one starting value/i,
        trapPattern: /slope or intercept means/i,
        transferPattern: /identify the rate and start value/i,
        lookForPattern: /constant rate and the starting value/i,
        rulePattern: /same slope-and-start story/i,
        mistakePattern: /rate-plus-start interpretation/i,
        transferGoalPattern: /Name the rate and starting amount/i,
      },
      {
        skillId: 'math_ratios_rates',
        workedExampleItem: seed.items.math_ratio_01,
        transferItem: seed.items.math_ratio_02,
        summaryPattern: /translation problems/i,
        trapPattern: /mismatched units or the wrong kind of comparison/i,
        transferPattern: /lock the units and comparison type/i,
        lookForPattern: /part-to-part, part-to-whole, or per-unit/i,
        rulePattern: /before you scale any numbers/i,
        mistakePattern: /setup drifts away from the story/i,
        transferGoalPattern: /matching units/i,
      },
      {
        skillId: 'math_circles',
        workedExampleItem: seed.items.math_circle_01,
        transferItem: seed.items.math_circle_02,
        summaryPattern: /diagram-translation questions/i,
        trapPattern: /wrong measure/i,
        transferPattern: /identify the circle quantity first/i,
        lookForPattern: /radius, diameter, arc, sector, tangent, circumference, or area/i,
        rulePattern: /choose the circle relationship or formula/i,
        mistakePattern: /quantity the diagram is actually giving/i,
        transferGoalPattern: /Name the circle quantity first/i,
      },
      {
        skillId: 'math_trigonometry',
        workedExampleItem: seed.items.math_trig_01,
        transferItem: seed.items.math_trig_02,
        summaryPattern: /Match the trig ratio to the sides you actually know/i,
        trapPattern: /Swapping opposite and adjacent/i,
        transferPattern: /verify the side labels first/i,
        lookForPattern: /reference angle and the side labels/i,
        rulePattern: /No trig ratio until the sides are labeled/i,
        mistakePattern: /labeling step that tells which ratio fits/i,
        transferGoalPattern: /Label the sides from the reference angle/i,
        fullPackCuePattern: /reference angle/i,
        fullPackContrastPattern: /remember a ratio and hope it fits/i,
        fullPackCheckPattern: /correct sides relative to the marked angle/i,
      },
    ];

    for (const testCase of cases) {
      const bundle = buildCurriculumLessonBundle({
        skillId: testCase.skillId,
        workedExampleItem: testCase.workedExampleItem,
        workedExampleRationale: seed.rationales[testCase.workedExampleItem.itemId],
        retryItem: testCase.workedExampleItem,
        transferItem: testCase.transferItem,
        transferRationale: seed.rationales[testCase.transferItem.itemId],
      });

      assert.match(bundle.teachCard.summary, testCase.summaryPattern);
      assert.match(bundle.teachCard.commonTrap, testCase.trapPattern);
      assert.ok(bundle.teachCard.lookForFirst);
      assert.ok(bundle.teachCard.ruleOfThumb);
      assert.ok(bundle.workedExample.mistakePattern);
      assert.ok(bundle.transferCard.transferGoal);
      if (testCase.lookForPattern) assert.match(bundle.teachCard.lookForFirst, testCase.lookForPattern);
      if (testCase.rulePattern) assert.match(bundle.teachCard.ruleOfThumb, testCase.rulePattern);
      if (testCase.mistakePattern) assert.match(bundle.workedExample.mistakePattern, testCase.mistakePattern);
      if (testCase.transferGoalPattern) assert.match(bundle.transferCard.transferGoal, testCase.transferGoalPattern);
      assert.match(bundle.transferCard.rationalePreview, testCase.transferPattern);
      assert.ok(bundle.workedExample.walkthrough.length >= 2);
      if (testCase.fullPackCuePattern) {
        assert.equal(bundle.packDepth, 'full');
        assert.match(bundle.retryCard.cue, testCase.fullPackCuePattern);
        assert.match(bundle.workedExample.contrastRule, testCase.fullPackContrastPattern);
        assert.match(bundle.transferCard.nearTransferCheck, testCase.fullPackCheckPattern);
        assert.ok(bundle.coachLanguage.exitTicketPrompt);
      }
    }
  });

  it('covers the full current curriculum map with authored teach-card summaries', async () => {
    const curriculum = JSON.parse(
      await readFile(new URL('../docs/curriculum/curriculum.v1.json', import.meta.url), 'utf8'),
    );

    for (const skill of curriculum.skills) {
      assert.ok(getLessonBlueprint(skill.skill_id), `expected authored blueprint for ${skill.skill_id}`);
    }
  });

  it('marks every curriculum skill with a middle/full lesson-pack tier and full-pack depth for the fixed cohort', async () => {
    assert.equal(FULL_PACK_SKILL_IDS.length, 11);
    const curriculum = JSON.parse(
      await readFile(new URL('../docs/curriculum/curriculum.v1.json', import.meta.url), 'utf8'),
    );
    const expectedFullPackSkills = new Set(FULL_PACK_SKILL_IDS);

    for (const skill of curriculum.skills) {
      assert.ok(['middle', 'full'].includes(skill.lesson_pack_tier), `expected lesson_pack_tier for ${skill.skill_id}`);
      assert.equal(skill.lesson_pack_version, 'v2');
      const blueprint = getLessonBlueprint(skill.skill_id);
      assert.equal(blueprint.packDepth, skill.lesson_pack_tier);
      assert.ok(blueprint.retryCue, `expected retry cue for ${skill.skill_id}`);
      assert.ok(blueprint.revisitPrompt, `expected revisit prompt for ${skill.skill_id}`);
      assert.ok(blueprint.successSignal, `expected success signal for ${skill.skill_id}`);

      if (expectedFullPackSkills.has(skill.skill_id)) {
        assert.equal(skill.lesson_pack_tier, 'full');
        for (const field of FULL_PACK_REQUIRED_FIELDS) {
          assert.ok(blueprint[field], `expected ${field} for ${skill.skill_id}`);
        }
      }
    }
  });
});

describe('integrity: curriculum path generator', () => {
  it('produces a 14-day path with anchor/support/revisit data', () => {
    const path = generateCurriculumPath({
      profile: {
        self_reported_weak_area: 'algebra',
      },
      skillStates: [
        {
          skill_id: 'math_linear_equations',
          mastery: 0.42,
          timed_mastery: 0.31,
          confidence_calibration: 0.44,
          retention_risk: 0.52,
          careless_risk: 0.48,
          attempts_count: 4,
        },
        {
          skill_id: 'math_linear_functions',
          mastery: 0.61,
          timed_mastery: 0.51,
          confidence_calibration: 0.5,
          retention_risk: 0.36,
          careless_risk: 0.22,
          attempts_count: 6,
        },
      ],
      reviewQueue: [
        {
          skill: 'math_linear_equations',
          dueAt: new Date().toISOString(),
          status: 'retry_recommended',
          lastAccuracy: 0.5,
          attemptCount: 2,
        },
      ],
    });

    assert.equal(path.horizonDays, 14);
    assert.equal(path.anchorSkill.skillId, 'math_linear_equations');
    assert.equal(path.anchorSkill.lessonPackTier, 'full');
    assert.ok(path.supportSkill);
    assert.ok(['middle', 'full'].includes(path.supportSkill.lessonPackTier));
    assert.ok(path.revisitCadence.length >= 1);
    assert.ok(path.revisitCadence.every((row) => Object.hasOwn(row, 'lessonPackTier')));
    assert.ok(path.revisitCadence.every((row) => Object.hasOwn(row, 'durabilitySignal')));
    assert.match(path.revisitCadence[0].reason, /did not hold|carry this retry forward|correction loop/i);
    assert.equal(path.revisitCadence[0].durabilitySignal, 'did_not_hold');
    assert.equal(path.dailyFocuses.length, 14);
    assert.ok(path.dailyFocuses.every((row) => ['middle', 'full'].includes(row.lessonPackTier)));
    assert.match(path.recoveryPath.trigger, /durability break|did not hold/i);
    assert.match(path.recoveryPath.adjustment, /Carry one short retry|retry loop/i);
  });
});

describe('integrity: program path generator', () => {
  it('produces multi-week phases above the 14-day sprint layer', () => {
    const curriculumPath = generateCurriculumPath({
      profile: {
        target_score: 1460,
        target_test_date: '2026-10-10',
        daily_minutes: 40,
        self_reported_weak_area: 'algebra',
      },
      skillStates: [
        {
          skill_id: 'math_linear_equations',
          mastery: 0.41,
          timed_mastery: 0.32,
          confidence_calibration: 0.46,
          retention_risk: 0.52,
          careless_risk: 0.45,
          attempts_count: 4,
        },
      ],
    });

    const programPath = generateProgramPath({
      profile: {
        target_score: 1460,
        target_test_date: '2026-10-10',
        daily_minutes: 40,
      },
      projection: {
        predicted_total_low: 980,
        predicted_total_high: 1060,
        readiness_indicator: 'building',
      },
      curriculumPath,
      generatedAt: '2026-06-01T00:00:00.000Z',
    });

    assert.ok(programPath.weeksRemaining >= 1);
    assert.ok(programPath.phases.length >= 3);
    assert.ok(programPath.sessionsPerWeek >= 3);
    assert.equal(programPath.sprintSummary.horizonDays, 14);
    assert.ok(programPath.roadmapBlocks.length >= 1);
    assert.ok(programPath.milestones.length >= 3);
    assert.equal(programPath.phases[0].key, programPath.activePhaseKey);
    assert.equal(programPath.targetDate, '2026-10-10');
    assert.ok(programPath.phases.every((phase) => ['completed', 'active', 'upcoming'].includes(phase.status)));
  });
});

describe('integrity: event validation — rejects unknown event names', () => {
  it('throws an Error with message containing Unknown event name for fake_event', () => {
    assert.throws(
      () => createEvent({ userId: DEMO_USER_ID, eventName: 'fake_event' }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Unknown event name'), `message was: ${err.message}`);
        return true;
      },
    );
  });
});

describe('integrity: ID format', () => {
  it('session ID matches pattern sess_ followed by 12 hex characters', () => {
    const store = createStore();
    const timedSet = store.startTimedSet(DEMO_USER_ID);
    assert.match(timedSet.session.id, /^sess_[0-9a-f]{12}$/);
  });
});

describe('integrity: session review only available for completed sessions', () => {
  it('getSessionReview throws before completion and succeeds after', () => {
    const store = createStore();
    const timedSet = store.startTimedSet(DEMO_USER_ID);
    const sessionId = timedSet.session.id;

    // Before completion — should throw
    assert.throws(
      () => store.getSessionReview(sessionId, DEMO_USER_ID),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
      'getSessionReview must throw when session is not yet complete',
    );

    // Submit all items to complete the session
    for (const item of timedSet.items) {
      store.submitAttempt(buildAttemptPayload(item, sessionId));
    }

    // After completion — should succeed and contain items with correctAnswer
    const review = store.getSessionReview(sessionId, DEMO_USER_ID);
    assert.ok(Array.isArray(review.items), 'review must contain an items array');
    assert.ok(review.items.length > 0, 'review items must not be empty');
    for (const reviewItem of review.items) {
      assert.ok('correctAnswer' in reviewItem, 'each review item must have correctAnswer');
      assert.ok(typeof reviewItem.correctAnswer === 'string');
    }
  });
});


describe('integrity: completion streak telemetry', () => {
  it('persists streak_kept and streak_broken when meaningful sessions land on consecutive and then broken days', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'helix-streak-telemetry-'));
    const stateFilePath = join(tempDir, 'prototype-state.json');
    try {
      const seed = createDemoData();
      const store = createStore({
        seed,
        storage: createStateStorage({ seed, filePath: stateFilePath }),
      });

      await withMockedNow('2026-03-01T15:00:00.000Z', async () => {
        const diagnostic = store.startDiagnostic(DEMO_USER_ID);
        for (const item of diagnostic.items) {
          store.submitAttempt(buildLearnAttemptPayload(DEMO_USER_ID, DEMO_ITEM_MAP.get(item.itemId), diagnostic.session.id, { correct: true }));
        }
      });

      await withMockedNow('2026-03-02T15:00:00.000Z', async () => {
        const quickWin = store.startQuickWin(DEMO_USER_ID);
        for (const item of quickWin.items) {
          store.submitAttempt(buildLearnAttemptPayload(DEMO_USER_ID, DEMO_ITEM_MAP.get(item.itemId), quickWin.session.id, { correct: true }));
        }
      });

      await withMockedNow('2026-03-05T15:00:00.000Z', async () => {
        const timedSet = store.startTimedSet(DEMO_USER_ID);
        const firstItem = DEMO_ITEM_MAP.get(timedSet.items[0].itemId);
        store.submitAttempt({
          ...buildLearnAttemptPayload(DEMO_USER_ID, firstItem, timedSet.session.id, { correct: true }),
          mode: 'exam',
        });
        store.finishTimedSet({ userId: DEMO_USER_ID, sessionId: timedSet.session.id });
      });

      const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
      const events = persisted.mutableState?.events ?? [];
      const kept = events.find((event) => event.event_name === 'streak_kept');
      const broken = events.find((event) => event.event_name === 'streak_broken');
      assert.ok(kept, 'expected a streak_kept event after consecutive-day completion');
      assert.ok(broken, 'expected a streak_broken event after a multi-day gap');
      assert.ok((kept.payload_json?.current ?? 0) >= 2);
      assert.equal(broken.payload_json?.gapDays, 3);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
