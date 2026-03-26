import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../services/api/server.mjs';

const authHeaders = {
  'Content-Type': 'application/json',
  'X-Demo-User-Id': 'demo-student',
};

async function withServer(run) {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('api serves profile, plan, diagnostic progression, attempt submission, review, reflection, and tutor hint', async () => {
  await withServer(async (baseUrl) => {
    const me = await fetch(`${baseUrl}/api/me`, { headers: authHeaders }).then((res) => res.json());
    assert.equal(me.id, 'demo-student');

    const plan = await fetch(`${baseUrl}/api/plan/today`, { headers: authHeaders }).then((res) => res.json());
    assert.ok(Array.isArray(plan.blocks));

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());
    assert.ok(diagnostic.session.id);
    assert.equal(diagnostic.sessionProgress.answered, 0);
    assert.ok(diagnostic.currentItem);

    const attemptOne = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 4,
        responseTimeMs: 45000,
      }),
    }).then((res) => res.json());
    assert.equal(attemptOne.sessionProgress.answered, 1);
    assert.ok(attemptOne.nextItem);
    assert.ok(Array.isArray(attemptOne.review.recommendations));
    assert.equal(attemptOne.review.recommendations[0].itemId, diagnostic.items[0].itemId);

    const review = await fetch(`${baseUrl}/api/review/recommendations`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.ok(review.reflectionPrompt);
    assert.ok(review.recommendations.length >= 1);

    const reflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sessionId: diagnostic.session.id,
        prompt: review.reflectionPrompt,
        response: 'I will re-read the exact scope before I commit to an answer.',
      }),
    }).then((res) => res.json());
    assert.equal(reflection.saved, true);
    assert.equal(reflection.totalReflections, 1);

    const hint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: 'math_linear_01',
        mode: 'learn',
        requestedLevel: 2,
      }),
    }).then((res) => res.json());
    assert.equal(hint.source_of_truth, 'canonical_rationale');
    assert.equal(hint.hint_level, 2);

    const missing = await fetch(`${baseUrl}/missing-route`);
    assert.equal(missing.status, 404);
  });
});

test('api rejects items that do not belong to the active session', async () => {
  await withServer(async (baseUrl) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const invalid = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: 'math_stats_01',
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 2,
        responseTimeMs: 30000,
      }),
    });
    assert.equal(invalid.status, 400);
  });
});

test('api exposes the active session for restore and returns null when nothing is active', async () => {
  await withServer(async (baseUrl) => {
    const initial = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());

    assert.equal(initial.hasActiveSession, false);
    assert.equal(initial.activeSession, null);

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const active = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());

    assert.equal(active.hasActiveSession, true);
    assert.equal(active.resumeAvailable, true);
    assert.equal(active.resumeReason, 'unfinished_session');
    assert.equal(active.activeSession.session.id, diagnostic.session.id);
    assert.equal(active.activeSession.currentItem.itemId, diagnostic.currentItem.itemId);
    assert.equal(active.activeSession.sessionProgress.answered, 0);
  });
});

test('api arbitrates overlapping exam sessions and returns the active session for resume', async () => {
  await withServer(async (baseUrl) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const conflictingStart = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(conflictingStart.status, 409);

    const conflict = await conflictingStart.json();
    assert.equal(conflict.conflict, true);
    assert.equal(conflict.reason, 'active_exam_session_exists');
    assert.equal(conflict.requestedSessionType, 'module_simulation');
    assert.equal(conflict.activeSession.session.id, timedSet.session.id);
    assert.equal(conflict.activeSession.session.type, 'timed_set');
    assert.equal(conflict.activeSession.currentItem.itemId, timedSet.currentItem.itemId);

    const active = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.equal(active.activeSession.session.id, timedSet.session.id);
    assert.equal(active.resumeReason, 'unfinished_exam_session');
  });
});

test('api serves timed-set start, completion, finish, and exam-mode hint blocking', async () => {
  await withServer(async (baseUrl) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    assert.equal(timedSet.session.type, 'timed_set');
    assert.equal(timedSet.session.exam_mode, true);
    assert.equal(timedSet.timing.timeLimitSec, 210);
    assert.equal(timedSet.timing.recommendedPaceSec, 70);
    assert.ok(timedSet.currentItem);

    const examHint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: timedSet.currentItem.itemId,
        sessionId: timedSet.session.id,
        mode: 'exam',
        requestedLevel: 1,
      }),
    }).then((res) => res.json());
    assert.equal(examHint.mode, 'exam_blocked');
    assert.equal(examHint.source_of_truth, 'exam_policy');

    const bypassAttemptHint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: timedSet.currentItem.itemId,
        sessionId: timedSet.session.id,
        mode: 'learn',
        requestedLevel: 1,
      }),
    }).then((res) => res.json());
    assert.equal(bypassAttemptHint.mode, 'exam_blocked');
    assert.equal(bypassAttemptHint.source_of_truth, 'exam_policy');

    let lastAttemptResult = null;
    for (const [index, item] of timedSet.items.entries()) {
      lastAttemptResult = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          itemId: item.itemId,
          selectedAnswer: index === 1 ? 'B' : 'A',
          sessionId: timedSet.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 60000,
        }),
      }).then((res) => res.json());
    }

    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);
    assert.equal(lastAttemptResult.sessionType, 'timed_set');
    assert.ok(lastAttemptResult.timedSummary);
    assert.equal(lastAttemptResult.timedSummary.completed, true);
    assert.equal(lastAttemptResult.timedSummary.timeLimitSec, 210);
    assert.equal(lastAttemptResult.timedSummary.paceStatus, 'on_pace');

    const finished = await fetch(`${baseUrl}/api/timed-set/finish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId: timedSet.session.id }),
    }).then((res) => res.json());

    assert.equal(finished.session.type, 'timed_set');
    assert.equal(finished.sessionProgress.isComplete, true);
    assert.equal(finished.timedSummary.sessionId, timedSet.session.id);
    assert.equal(typeof finished.timedSummary.nextAction, 'string');

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: authHeaders,
    }).then((res) => res.json());

    assert.equal(dashboard.latestTimedSetSummary.sessionId, timedSet.session.id);
    assert.equal(dashboard.latestTimedSetSummary.completed, true);
  });
});

test('api restores the active session and prevents parallel exam-mode starts', async () => {
  await withServer(async (baseUrl) => {
    const noActiveSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.equal(noActiveSession.hasActiveSession, false);
    assert.equal(noActiveSession.activeSession, null);

    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());
    assert.equal(timedSet.started, true);
    assert.equal(timedSet.resumed, false);

    const activeSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.equal(activeSession.hasActiveSession, true);
    assert.equal(activeSession.activeSession.session.id, timedSet.session.id);
    assert.equal(activeSession.activeSession.currentItem.itemId, timedSet.currentItem.itemId);
    assert.equal(activeSession.resumeReason, 'unfinished_exam_session');

    const conflictResponse = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(conflictResponse.status, 409);
    const conflict = await conflictResponse.json();
    assert.equal(conflict.conflict, true);
    assert.equal(conflict.reason, 'active_exam_session_exists');
    assert.equal(conflict.requestedSessionType, 'module_simulation');
    assert.equal(conflict.activeSession.session.id, timedSet.session.id);
    assert.equal(typeof conflict.conflictMessage, 'string');

    const finished = await fetch(`${baseUrl}/api/timed-set/finish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId: timedSet.session.id }),
    }).then((res) => res.json());
    assert.equal(finished.session.id, timedSet.session.id);

    const clearedActiveSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.equal(clearedActiveSession.hasActiveSession, false);
    assert.equal(clearedActiveSession.activeSession, null);
  });
});

test('api serves module simulation start, completion, finish, and dashboard/history summaries', async () => {
  await withServer(async (baseUrl) => {
    const moduleSimulation = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    assert.equal(moduleSimulation.session.type, 'module_simulation');
    assert.equal(moduleSimulation.session.exam_mode, true);
    assert.equal(moduleSimulation.timing.timeLimitSec, 420);
    assert.equal(moduleSimulation.timing.recommendedPaceSec, 105);
    assert.equal(moduleSimulation.items.length, 4);
    assert.ok(moduleSimulation.currentItem);
    assert.equal(moduleSimulation.moduleSummary.sessionId, moduleSimulation.session.id);

    const examHint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: moduleSimulation.currentItem.itemId,
        sessionId: moduleSimulation.session.id,
        mode: 'learn',
        requestedLevel: 1,
      }),
    }).then((res) => res.json());
    assert.equal(examHint.mode, 'exam_blocked');
    assert.equal(examHint.source_of_truth, 'exam_policy');

    let lastAttemptResult = null;
    const answers = ['B', 'B', 'C', 'C'];
    for (const [index, item] of moduleSimulation.items.entries()) {
      lastAttemptResult = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          itemId: item.itemId,
          selectedAnswer: answers[index],
          sessionId: moduleSimulation.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 90000,
        }),
      }).then((res) => res.json());
    }

    assert.equal(lastAttemptResult.sessionType, 'module_simulation');
    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);
    assert.ok(lastAttemptResult.moduleSummary);
    assert.equal(lastAttemptResult.moduleSummary.completed, true);
    assert.equal(lastAttemptResult.moduleSummary.paceStatus, 'on_pace');
    assert.equal(lastAttemptResult.moduleSummary.readinessSignal, 'ready_to_extend');
    assert.equal(lastAttemptResult.moduleSummary.sectionBreakdown.length, 2);
    assert.equal(lastAttemptResult.moduleSummary.domainBreakdown.length, 3);

    const finished = await fetch(`${baseUrl}/api/module/finish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId: moduleSimulation.session.id }),
    }).then((res) => res.json());

    assert.equal(finished.session.type, 'module_simulation');
    assert.equal(finished.moduleSummary.sessionId, moduleSimulation.session.id);
    assert.equal(finished.moduleSummary.completed, true);

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.equal(dashboard.latestModuleSummary.sessionId, moduleSimulation.session.id);
    assert.equal(dashboard.latestModuleSummary.completed, true);

    const history = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: authHeaders,
    }).then((res) => res.json());
    const moduleHistory = history.sessions.find((session) => session.sessionId === moduleSimulation.session.id);
    assert.ok(moduleHistory);
    assert.equal(moduleHistory.type, 'module_simulation');
    assert.equal(moduleHistory.moduleSummary.sessionId, moduleSimulation.session.id);
  });
});

test('api returns session history for the authenticated learner', async () => {
  await withServer(async (baseUrl) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 42000,
      }),
    });

    const historyResponse = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: authHeaders,
    });
    assert.equal(historyResponse.status, 200);

    const history = await historyResponse.json();
    assert.ok(Array.isArray(history.sessions));
    assert.ok(history.sessions.length >= 1);
    assert.equal(history.sessions[0].sessionId, diagnostic.session.id);
  });
});

test('api returns a parent-facing learner summary', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parent/summary`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const summary = await response.json();
    assert.equal(typeof summary.learnerName, 'string');
    assert.ok(summary.currentProjection);
    assert.equal(typeof summary.recommendedParentAction, 'string');
  });
});

test('api returns a teacher-facing learner brief', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const brief = await response.json();
    assert.equal(typeof brief.learnerName, 'string');
    assert.ok(Array.isArray(brief.interventionPriorities));
    assert.equal(typeof brief.teacherActionNote, 'string');
  });
});

test('api returns teacher assignment recommendations', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const assignments = await response.json();
    assert.ok(Array.isArray(assignments.recommended));
    assert.ok(Array.isArray(assignments.saved));
  });
});

test('api saves a teacher assignment draft', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Scope mismatch recovery',
        objective: 'Reinforce sentence-role reading discipline.',
        minutes: 20,
        focusSkill: 'rw_text_structure_and_purpose',
        mode: 'review',
      }),
    });
    assert.equal(response.status, 200);

    const saved = await response.json();
    assert.equal(saved.saved, true);
    assert.equal(saved.assignment.title, 'Scope mismatch recovery');
  });
});

test('api requires demo auth, enforces request size guard, and validates reflection payloads', async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/me`);
    assert.equal(unauthorized.status, 401);

    const oversized = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ filler: 'x'.repeat(40_000) }),
    });
    assert.equal(oversized.status, 413);

    const invalidReflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ response: '   ' }),
    });
    assert.equal(invalidReflection.status, 400);
  });
});
