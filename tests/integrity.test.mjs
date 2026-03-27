import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../services/api/src/store.mjs';
import { projectScoreBand } from '../packages/scoring/src/score-predictor.mjs';
import { generateDailyPlan } from '../packages/assessment/src/daily-plan-generator.mjs';
import { generateCurriculumPath } from '../packages/curriculum/src/path-generator.mjs';
import { inferSkillStage, getCurriculumSkill } from '../packages/curriculum/src/mastery-gates.mjs';
import { createEvent } from '../packages/telemetry/src/events.mjs';

const DEMO_USER_ID = 'demo-student';

function buildAttemptPayload(item, sessionId, mode = 'exam') {
  if (item.item_format === 'grid_in') {
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
  it('returns status low_evidence and confidence <= 0.25 for 1-2 skill states', () => {
    const skillState = {
      skill_id: 'math_linear',
      section: 'math',
      mastery: 0.5,
      timed_mastery: 0.5,
      retention_risk: 0.2,
      careless_risk: 0.1,
    };
    const result = projectScoreBand([skillState]);
    assert.equal(result.status, 'low_evidence');
    assert.ok(result.confidence <= 0.25, `confidence ${result.confidence} should be <= 0.25`);
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
          status: 'revisit_due',
        },
      ],
    });

    assert.equal(path.horizonDays, 14);
    assert.equal(path.anchorSkill.skillId, 'math_linear_equations');
    assert.ok(path.supportSkill);
    assert.ok(path.revisitCadence.length >= 1);
    assert.equal(path.dailyFocuses.length, 14);
    assert.ok(path.recoveryPath.adjustment.includes('retry loop'));
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
