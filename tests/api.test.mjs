import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppServer } from '../services/api/server.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createStateStorage } from '../services/api/src/state-storage.mjs';
import { createStore } from '../services/api/src/store.mjs';

const demoItemMap = new Map(
  Object.values(createDemoData().items).map((item) => [item.itemId, item]),
);
let uniqueUserCounter = 0;

function buildAttemptAnswer(itemId) {
  const item = demoItemMap.get(itemId);
  if (!item) throw new Error(`Missing item ${itemId}`);
  const value = item.item_format === 'grid_in'
    ? (item.responseValidation?.acceptedResponses?.[0] ?? item.answerKey)
    : item.answerKey;
  return item.item_format === 'grid_in'
    ? { freeResponse: value }
    : { selectedAnswer: value };
}

function buildIncorrectAttemptAnswer(itemId) {
  const item = demoItemMap.get(itemId);
  if (!item) throw new Error(`Missing item ${itemId}`);
  if (item.item_format === 'grid_in') {
    return { freeResponse: STUDENT_RESPONSE_FIXTURES[item.itemId]?.incorrect ?? '0' };
  }
  const wrongChoice = item.choices.find((choice) => choice.key !== item.answerKey)?.key ?? 'A';
  return { selectedAnswer: wrongChoice };
}

const STUDENT_RESPONSE_FIXTURES = {
  math_linear_04: {
    correct: '11/2',
    incorrect: '3/2',
  },
};

function buildAttemptBody(item, {
  sessionId,
  mode,
  confidenceLevel = 3,
  responseTimeMs = 60000,
  selectedAnswer = 'A',
  freeResponse = null,
} = {}) {
  if (['grid_in', 'student_produced_response', 'student-produced-response'].includes(item.item_format)) {
    return {
      itemId: item.itemId,
      sessionId,
      mode,
      confidenceLevel,
      responseTimeMs,
      freeResponse: freeResponse ?? STUDENT_RESPONSE_FIXTURES[item.itemId]?.incorrect ?? '0',
    };
  }

  return {
    itemId: item.itemId,
    sessionId,
    mode,
    confidenceLevel,
    responseTimeMs,
    selectedAnswer,
  };
}

async function withPersistentStateFile(prefix, run) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  const stateFilePath = join(tempDir, 'prototype-state.json');
  try {
    await run({ tempDir, stateFilePath });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function withServer(run, options = {}) {
  const server = createAppServer(options);
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

async function createSession(baseUrl, { email, password = 'demo1234' }) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `expected login success for ${email}`);
  const cookieHeader = response.headers.get('set-cookie');
  assert.ok(cookieHeader, `expected auth cookie for ${email}`);
  const cookie = cookieHeader.split(';')[0];
  return {
    payload,
    cookie,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
  };
}

function nextUniqueEmail(prefix = 'user') {
  uniqueUserCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueUserCounter}@example.com`;
}

async function registerSession(baseUrl, {
  name = 'Test Student',
  email = nextUniqueEmail('student'),
  password = 'pass1234',
  extraBody = {},
} = {}) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, ...extraBody }),
  });
  const payload = await response.json();
  const cookieHeader = response.headers.get('set-cookie');
  return {
    response,
    payload,
    cookie: cookieHeader?.split(';')[0] ?? null,
    headers: cookieHeader
      ? {
        'Content-Type': 'application/json',
        Cookie: cookieHeader.split(';')[0],
      }
      : { 'Content-Type': 'application/json' },
    email,
    password,
  };
}

async function withAuthedServer(run, options = {}) {
  await withServer(async (baseUrl) => {
    const sessions = {
      student: await createSession(baseUrl, { email: 'mina@example.com' }),
      teacher: await createSession(baseUrl, { email: 'teacher@example.com' }),
      parent: await createSession(baseUrl, { email: 'parent@example.com' }),
    };
    await run(baseUrl, sessions);
  }, options);
}

test('api serves profile, plan, diagnostic progression, attempt submission, review, reflection, and tutor hint', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const me = await fetch(`${baseUrl}/api/me`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(me.id, 'demo-student');

    const plan = await fetch(`${baseUrl}/api/plan/today`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.ok(Array.isArray(plan.blocks));

    const dashboardBefore = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(typeof dashboardBefore.planExplanation.headline, 'string');
    assert.equal(Array.isArray(dashboardBefore.projectionEvidence.whyChanged), true);
    assert.equal(Array.isArray(dashboardBefore.errorDnaSummary), true);
    assert.equal(typeof dashboardBefore.whatChanged.headline, 'string');

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());
    assert.ok(diagnostic.session.id);
    assert.equal(diagnostic.sessionProgress.answered, 0);
    assert.ok(diagnostic.currentItem);

    const attemptOne = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        ...buildAttemptAnswer(diagnostic.items[0].itemId),
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
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.ok(review.reflectionPrompt);
    assert.ok(review.recommendations.length >= 1);
    assert.ok(Array.isArray(review.remediationCards));
    assert.ok(review.remediationCards.length >= 1);
    assert.equal(typeof review.remediationCards[0].misconception, 'string');
    assert.ok(review.remediationCards[0].retryItem?.itemId);

    const reflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
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
      headers: sessions.student.headers,
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
  await withAuthedServer(async (baseUrl, sessions) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const invalid = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({
        itemId: 'math_stats_01',
        ...buildAttemptAnswer('math_stats_01'),
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
  await withAuthedServer(async (baseUrl, sessions) => {
    const initial = await fetch(`${baseUrl}/api/session/active`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());

    assert.equal(initial.hasActiveSession, false);
    assert.equal(initial.activeSession, null);

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const active = await fetch(`${baseUrl}/api/session/active`, {
      headers: sessions.student.headers,
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
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const conflictingStart = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: sessions.student.headers,
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
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(active.activeSession.session.id, timedSet.session.id);
    assert.equal(active.resumeReason, 'unfinished_exam_session');
  });
});

test('api serves timed-set start, completion, finish, and exam-mode hint blocking', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    assert.equal(timedSet.session.type, 'timed_set');
    assert.equal(timedSet.session.exam_mode, true);
    assert.equal(timedSet.timing.timeLimitSec, 210);
    assert.equal(timedSet.timing.recommendedPaceSec, 70);
    assert.ok(timedSet.currentItem);

    const examHint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: sessions.student.headers,
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
      headers: sessions.student.headers,
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
        headers: sessions.student.headers,
        body: JSON.stringify(buildAttemptBody(item, {
          sessionId: timedSet.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 60000,
          selectedAnswer: index === 1 ? 'B' : 'A',
        })),
      }).then((res) => res.json());
    }

    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);
    assert.equal(lastAttemptResult.sessionType, 'timed_set');
    assert.equal(lastAttemptResult.attemptId.startsWith('attempt_'), true);
    assert.equal(lastAttemptResult.summary.kind, 'timed_set');
    assert.equal(lastAttemptResult.summary.payload.completed, true);
    assert.equal(lastAttemptResult.summary.payload.timeLimitSec, 210);
    assert.equal(typeof lastAttemptResult.summary.payload.remainingTimeSec, 'number');
    assert.equal(lastAttemptResult.summary.payload.section, null);

    const finished = await fetch(`${baseUrl}/api/timed-set/finish`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({ sessionId: timedSet.session.id }),
    }).then((res) => res.json());

    assert.equal(finished.session.type, 'timed_set');
    assert.equal(finished.sessionProgress.isComplete, true);
    assert.equal(finished.timedSummary.sessionId, timedSet.session.id);
    assert.equal(typeof finished.timedSummary.nextAction, 'string');

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());

    assert.equal(dashboard.latestTimedSetSummary.sessionId, timedSet.session.id);
    assert.equal(dashboard.latestTimedSetSummary.completed, true);
  });
});

test('api restores the active session and prevents parallel exam-mode starts', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const noActiveSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(noActiveSession.hasActiveSession, false);
    assert.equal(noActiveSession.activeSession, null);

    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());
    assert.equal(timedSet.started, true);
    assert.equal(timedSet.resumed, false);

    const activeSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(activeSession.hasActiveSession, true);
    assert.equal(activeSession.activeSession.session.id, timedSet.session.id);
    assert.equal(activeSession.activeSession.currentItem.itemId, timedSet.currentItem.itemId);
    assert.equal(activeSession.resumeReason, 'unfinished_exam_session');

    const conflictResponse = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: sessions.student.headers,
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
      headers: sessions.student.headers,
      body: JSON.stringify({ sessionId: timedSet.session.id }),
    }).then((res) => res.json());
    assert.equal(finished.session.id, timedSet.session.id);

    const clearedActiveSession = await fetch(`${baseUrl}/api/session/active`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(clearedActiveSession.hasActiveSession, false);
    assert.equal(clearedActiveSession.activeSession, null);
  });
});

test('api serves module simulation start, completion, finish, and dashboard/history summaries', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const moduleSimulation = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({ section: 'math' }),
    }).then((res) => res.json());

    assert.equal(moduleSimulation.session.type, 'module_simulation');
    assert.equal(moduleSimulation.session.exam_mode, true);
    assert.equal(moduleSimulation.session.section, 'math');
    assert.equal(moduleSimulation.timing.timeLimitSec, 1050);
    assert.equal(moduleSimulation.timing.recommendedPaceSec, 105);
    assert.equal(moduleSimulation.items.length, 10);
    assert.ok(moduleSimulation.currentItem);
    assert.equal(moduleSimulation.moduleSummary.sessionId, moduleSimulation.session.id);
    assert.ok(new Set(moduleSimulation.items.map((item) => item.skill)).size >= 6);
    assert.ok(new Set(moduleSimulation.items.map((item) => item.domain)).size >= 4);
    const gridInItems = moduleSimulation.items.filter((item) => item.item_format === 'grid_in');
    assert.ok(gridInItems.length >= 2);
    assert.equal(gridInItems[0].responseValidation.acceptedResponses, undefined);

    const examHint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: sessions.student.headers,
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
    for (const item of moduleSimulation.items) {
      lastAttemptResult = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({
          itemId: item.itemId,
          ...buildAttemptAnswer(item.itemId),
          sessionId: moduleSimulation.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 90000,
        }),
      }).then((res) => res.json());
    }

    assert.equal(lastAttemptResult.sessionType, 'module_simulation');
    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);
    assert.equal(lastAttemptResult.summary.kind, 'module_simulation');
    assert.equal(lastAttemptResult.summary.payload.completed, true);
    assert.equal(lastAttemptResult.summary.payload.section, 'math');
    assert.equal(typeof lastAttemptResult.summary.payload.remainingTimeSec, 'number');

    const finished = await fetch(`${baseUrl}/api/module/finish`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({ sessionId: moduleSimulation.session.id }),
    }).then((res) => res.json());

    assert.equal(finished.session.type, 'module_simulation');
    assert.equal(finished.moduleSummary.sessionId, moduleSimulation.session.id);
    assert.equal(finished.moduleSummary.completed, true);

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    assert.equal(dashboard.latestModuleSummary.sessionId, moduleSimulation.session.id);
    assert.equal(dashboard.latestModuleSummary.completed, true);

    const history = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: sessions.student.headers,
    }).then((res) => res.json());
    const moduleHistory = history.sessions.find((session) => session.sessionId === moduleSimulation.session.id);
    assert.ok(moduleHistory);
    assert.equal(moduleHistory.type, 'module_simulation');
    assert.equal(moduleHistory.moduleSummary.sessionId, moduleSimulation.session.id);
  });
});

test('api returns session history for the authenticated learner', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        ...buildAttemptAnswer(diagnostic.items[0].itemId),
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 42000,
      }),
    });

    const historyResponse = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: sessions.student.headers,
    });
    assert.equal(historyResponse.status, 200);

    const history = await historyResponse.json();
    assert.ok(Array.isArray(history.sessions));
    assert.ok(history.sessions.length >= 1);
    assert.equal(history.sessions[0].sessionId, diagnostic.session.id);
  });
});

test('api returns a parent-facing learner summary', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/parent/summary?learnerId=demo-student`, {
      headers: sessions.parent.headers,
    });
    assert.equal(response.status, 200);

    const summary = await response.json();
    assert.equal(typeof summary.learnerName, 'string');
    assert.ok(summary.currentProjection);
    assert.equal(typeof summary.recommendedParentAction, 'string');
  });
});

test('api returns a teacher-facing learner brief', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief?learnerId=demo-student`, {
      headers: sessions.teacher.headers,
    });
    assert.equal(response.status, 200);

    const brief = await response.json();
    assert.equal(typeof brief.learnerName, 'string');
    assert.ok(Array.isArray(brief.interventionPriorities));
    assert.equal(typeof brief.teacherActionNote, 'string');
  });
});

test('api returns teacher assignment recommendations', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments?learnerId=demo-student`, {
      headers: sessions.teacher.headers,
    });
    assert.equal(response.status, 200);

    const assignments = await response.json();
    assert.ok(Array.isArray(assignments.recommended));
    assert.ok(Array.isArray(assignments.saved));
  });
});

test('api saves a teacher assignment draft', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      method: 'POST',
      headers: sessions.teacher.headers,
      body: JSON.stringify({
        learnerId: 'demo-student',
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
  await withAuthedServer(async (baseUrl, sessions) => {
    const unauthorized = await fetch(`${baseUrl}/api/me`);
    assert.equal(unauthorized.status, 401);

    const oversized = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({ filler: 'x'.repeat(40_000) }),
    });
    assert.equal(oversized.status, 413);

    const invalidReflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({ response: '   ' }),
    });
    assert.equal(invalidReflection.status, 400);
  });
});

test('api public register only creates student accounts and rejects client-supplied roles', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Fresh Student',
      email: nextUniqueEmail('fresh-student'),
      password: 'pass1234',
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.user.role, 'student');
    assert.ok(registered.cookie);

    const me = await fetch(`${baseUrl}/api/me`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(me.role, 'student');

    const privilegedAttempt = await registerSession(baseUrl, {
      name: 'Bad Teacher',
      email: nextUniqueEmail('bad-teacher'),
      password: 'pass1234',
      extraBody: { role: 'teacher' },
    });
    assert.equal(privilegedAttempt.response.status, 400);
    assert.equal(privilegedAttempt.payload.error, 'Request validation failed');
    assert.ok(privilegedAttempt.payload.details.some((detail) => /body\.role is not allowed/i.test(detail)));
  });
});

test('api exposes goal profile setup and updates next-best-action after completion', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Goal Setup Student',
      email: nextUniqueEmail('goal-student'),
      password: 'pass1234',
    });
    assert.equal(registered.response.status, 201);

    const goalProfileBefore = await fetch(`${baseUrl}/api/goal-profile`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(goalProfileBefore.isComplete, false);
    assert.equal(goalProfileBefore.targetScore, 1400);

    const nextBefore = await fetch(`${baseUrl}/api/next-best-action`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(nextBefore.kind, 'complete_goal_setup');

    const updatedGoalProfile = await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1480,
        targetTestDate: '2026-10-03',
        dailyMinutes: 45,
        selfReportedWeakArea: 'algebra',
      }),
    }).then((res) => res.json());
    assert.equal(updatedGoalProfile.isComplete, true);
    assert.equal(updatedGoalProfile.targetScore, 1480);
    assert.equal(updatedGoalProfile.targetTestDate, '2026-10-03');
    assert.equal(updatedGoalProfile.dailyMinutes, 45);
    assert.equal(updatedGoalProfile.selfReportedWeakArea, 'algebra');

    const nextAfter = await fetch(`${baseUrl}/api/next-best-action`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(nextAfter.kind, 'start_diagnostic');
    assert.equal(nextAfter.sessionType, 'diagnostic');
  });
});

test('api fresh student diagnostic seeds skill states and exits empty-state planning', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Bootstrap Student',
      email: nextUniqueEmail('bootstrap-student'),
      password: 'pass1234',
    });
    assert.equal(registered.response.status, 201);

    const projectionBefore = await fetch(`${baseUrl}/api/projection`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(projectionBefore.status, 'insufficient_evidence');

    const planBefore = await fetch(`${baseUrl}/api/plan/today`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(planBefore.status, 'needs_diagnostic');

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const firstItem = diagnostic.currentItem;
    const attempt = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        itemId: firstItem.itemId,
        ...buildAttemptAnswer(firstItem.itemId),
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 40000,
      }),
    }).then((res) => res.json());
    assert.equal(attempt.sessionProgress.answered, 1);

    const projectionAfter = await fetch(`${baseUrl}/api/projection`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(projectionAfter.status, 'low_evidence');

    const planAfter = await fetch(`${baseUrl}/api/plan/today`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.notEqual(planAfter.status, 'needs_diagnostic');
    assert.notEqual(planAfter.blocks[0].block_type, 'diagnostic');
  });
});

test('api returns a diagnostic reveal after diagnostic completion', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Reveal Student',
      email: nextUniqueEmail('reveal-student'),
      password: 'pass1234',
    });

    await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1450,
        targetTestDate: '2026-09-12',
        dailyMinutes: 35,
        selfReportedWeakArea: 'inference',
      }),
    });

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    let lastAttempt = null;
    for (const item of diagnostic.items) {
      lastAttempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: registered.headers,
        body: JSON.stringify({
          itemId: item.itemId,
          ...buildAttemptAnswer(item.itemId),
          sessionId: diagnostic.session.id,
          mode: 'learn',
          confidenceLevel: 3,
          responseTimeMs: 30000,
        }),
      }).then((res) => res.json());
    }

    assert.equal(lastAttempt.sessionProgress.isComplete, true);
    assert.equal(lastAttempt.diagnosticReveal.sessionId, diagnostic.session.id);
    assert.ok(lastAttempt.diagnosticReveal.scoreBand.low >= 400);
    assert.equal(Array.isArray(lastAttempt.diagnosticReveal.topScoreLeaks), true);
    assert.ok(lastAttempt.diagnosticReveal.firstRecommendedAction);

    const reveal = await fetch(`${baseUrl}/api/diagnostic/reveal`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(reveal.sessionId, diagnostic.session.id);
    assert.ok(reveal.firstRecommendedAction.kind === 'start_module' || reveal.firstRecommendedAction.kind === 'start_timed_set');
  });
});

test('api returns a weekly digest with strengths, risks, and focus after learner activity', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Weekly Digest Student',
      email: nextUniqueEmail('weekly-digest-student'),
      password: 'pass1234',
    });

    await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1420,
        targetTestDate: '2026-11-07',
        dailyMinutes: 35,
        selfReportedWeakArea: 'transitions',
      }),
    });

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        ...buildIncorrectAttemptAnswer(diagnostic.items[0].itemId),
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 2,
        responseTimeMs: 33000,
      }),
    });

    for (const item of diagnostic.items.slice(1)) {
      await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: registered.headers,
        body: JSON.stringify({
          itemId: item.itemId,
          ...buildAttemptAnswer(item.itemId),
          sessionId: diagnostic.session.id,
          mode: 'learn',
          confidenceLevel: 3,
          responseTimeMs: 28000,
        }),
      });
    }

    const digest = await fetch(`${baseUrl}/api/reports/weekly`, {
      headers: registered.headers,
    }).then((res) => res.json());

    assert.match(digest.period_start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(digest.period_end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(digest.strengths));
    assert.ok(Array.isArray(digest.risks));
    assert.ok(Array.isArray(digest.recommended_focus));
    assert.ok(digest.strengths.length >= 1);
    assert.ok(digest.risks.length >= 1);
    assert.ok(digest.recommended_focus.length >= 1);
    assert.ok(['declining', 'flat', 'improving', 'strong'].includes(digest.projected_momentum));
    assert.equal(typeof digest.parent_summary, 'string');
    assert.equal(typeof digest.teacher_brief, 'string');
  });
});

test('api returns a curriculum path with anchor, support, and 14-day focuses', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Curriculum Path Student',
      email: nextUniqueEmail('curriculum-path-student'),
      password: 'pass1234',
    });

    await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1460,
        targetTestDate: '2026-10-10',
        dailyMinutes: 40,
        selfReportedWeakArea: 'algebra',
      }),
    });

    const initialPath = await fetch(`${baseUrl}/api/curriculum/path`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(initialPath.horizonDays, 14);
    assert.equal(initialPath.dailyFocuses.length, 14);
    assert.ok(initialPath.anchorSkill);

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const firstItem = diagnostic.items[0];
    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        itemId: firstItem.itemId,
        ...buildAttemptAnswer(firstItem.itemId),
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 35000,
      }),
    }).then((res) => res.json());

    const updatedPath = await fetch(`${baseUrl}/api/curriculum/path`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(updatedPath.horizonDays, 14);
    assert.ok(updatedPath.anchorSkill.stage !== 'unseen');
    assert.ok(updatedPath.revisitCadence.length >= 1);

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.ok(dashboard.curriculumPath);
    assert.equal(dashboard.curriculumPath.horizonDays, 14);
  });
});

test('api returns a multi-week program path that wraps the current sprint', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Program Path Student',
      email: nextUniqueEmail('program-path-student'),
      password: 'pass1234',
    });

    await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1500,
        targetTestDate: '2026-12-05',
        dailyMinutes: 50,
        selfReportedWeakArea: 'inference',
      }),
    });

    const programPath = await fetch(`${baseUrl}/api/program/path`, {
      headers: registered.headers,
    }).then((res) => res.json());

    assert.ok(programPath.weeksRemaining >= 1);
    assert.ok(programPath.phases.length >= 3);
    assert.ok(programPath.sessionsPerWeek >= 3);
    assert.equal(programPath.sprintSummary.horizonDays, 14);
    assert.ok(programPath.roadmapBlocks.length >= 1);
    assert.ok(programPath.milestones.length >= 3);
    assert.equal(programPath.targetDate, '2026-12-05');
    assert.ok(programPath.phases.every((phase) => typeof phase.progress === 'number'));

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.ok(dashboard.programPath);
    assert.equal(dashboard.programPath.sprintSummary.horizonDays, 14);
    assert.ok(dashboard.programPath.roadmapBlocks.length >= 1);
  });
});

test('api starts a retry loop from review recommendations and schedules a revisit', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Retry Loop Student',
      email: nextUniqueEmail('retry-loop-student'),
      password: 'pass1234',
    });

    await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        targetScore: 1380,
        targetTestDate: '2026-10-10',
        dailyMinutes: 30,
        selfReportedWeakArea: 'timing',
      }),
    });

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const firstItem = diagnostic.items[0];
    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({
        itemId: firstItem.itemId,
        ...buildIncorrectAttemptAnswer(firstItem.itemId),
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 2,
        responseTimeMs: 35000,
      }),
    });

    for (const item of diagnostic.items.slice(1)) {
      await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: registered.headers,
        body: JSON.stringify({
          itemId: item.itemId,
          ...buildAttemptAnswer(item.itemId),
          sessionId: diagnostic.session.id,
          mode: 'learn',
          confidenceLevel: 3,
          responseTimeMs: 30000,
        }),
      });
    }

    const reviewBefore = await fetch(`${baseUrl}/api/review/recommendations`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.ok(reviewBefore.remediationCards.length >= 1);
    assert.equal(reviewBefore.remediationCards[0].retryAction.kind, 'start_retry_loop');

    const nextBestAction = await fetch(`${baseUrl}/api/next-best-action`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.equal(nextBestAction.kind, 'start_retry_loop');
    assert.ok(nextBestAction.itemId);

    const retrySession = await fetch(`${baseUrl}/api/review/retry/start`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({ itemId: reviewBefore.remediationCards[0].itemId }),
    }).then((res) => res.json());
    assert.equal(retrySession.session.type, 'review');
    assert.equal(retrySession.currentItem.itemId, reviewBefore.remediationCards[0].itemId);
    assert.ok(retrySession.sessionProgress.total >= 2);

    let activeItem = retrySession.currentItem;
    let lastAttempt = null;
    while (activeItem) {
      lastAttempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: registered.headers,
        body: JSON.stringify({
          itemId: activeItem.itemId,
          ...buildAttemptAnswer(activeItem.itemId),
          sessionId: retrySession.session.id,
          mode: 'review',
          confidenceLevel: 3,
          responseTimeMs: 25000,
        }),
      }).then((res) => res.json());
      activeItem = lastAttempt.nextItem ?? null;
    }

    assert.equal(lastAttempt.sessionType, 'review');
    assert.equal(lastAttempt.sessionProgress.isComplete, true);

    const reviewAfter = await fetch(`${baseUrl}/api/review/recommendations`, {
      headers: registered.headers,
    }).then((res) => res.json());
    assert.ok(Array.isArray(reviewAfter.revisitQueue));
    const revisitEntry = reviewAfter.revisitQueue.find((entry) => entry.itemId === reviewBefore.remediationCards[0].itemId);
    assert.ok(revisitEntry);
    assert.ok(['revisit_due', 'retry_recommended', 'retry_started'].includes(revisitEntry.status));
    assert.ok(revisitEntry.dueAt);
  });
});

test('api teacher routes require explicit learner context', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief`, {
      headers: sessions.teacher.headers,
    });
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.match(payload.error, /learnerId is required/i);
  });
});

test('api exam submit ACK omits correctness and review payloads', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const attempt = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: sessions.student.headers,
      body: JSON.stringify({
        itemId: timedSet.currentItem.itemId,
        ...buildAttemptAnswer(timedSet.currentItem.itemId),
        sessionId: timedSet.session.id,
        mode: 'exam',
        confidenceLevel: 3,
        responseTimeMs: 45000,
      }),
    }).then((res) => res.json());

    assert.equal(attempt.sessionType, 'timed_set');
    assert.equal(typeof attempt.attemptId, 'string');
    assert.equal('correctAnswer' in attempt, false);
    assert.equal('distractorTag' in attempt, false);
    assert.equal('review' in attempt, false);
    assert.equal('projection' in attempt, false);
    assert.equal('plan' in attempt, false);
    assert.equal('nextItem' in attempt, false);
  });
});


test('store restores exam timing from wall-clock time and marks expired sessions in the active payload', () => {
  const store = createStore();
  const timedSet = store.startTimedSet('demo-student');
  const session = store.getSession(timedSet.session.id);
  session.started_at = new Date(Date.now() - ((session.time_limit_sec + 15) * 1000)).toISOString();

  const active = store.getActiveSession('demo-student');
  assert.equal(active.hasActiveSession, true);
  assert.equal(active.activeSession.session.id, timedSet.session.id);
  assert.equal(active.activeSession.timing.timeLimitSec, 210);
  assert.equal(active.activeSession.timing.remainingTimeSec, 0);
  assert.equal(active.activeSession.timing.expired, true);
  assert.ok(active.activeSession.timing.expiresAt);

  const summary = store.getTimedSetSummary(timedSet.session.id);
  assert.equal(summary.expired, true);
  assert.equal(summary.completed, true);
  assert.equal(summary.paceStatus, 'over_time');
  assert.match(summary.nextAction, /Time expired/i);
});

test('store rejects attempts after exam time expires and returns a resumable summary payload', () => {
  const store = createStore();
  const moduleSimulation = store.startModuleSimulation('demo-student');
  const session = store.getSession(moduleSimulation.session.id);
  session.started_at = new Date(Date.now() - ((session.time_limit_sec + 30) * 1000)).toISOString();

  let thrown = null;
  try {
    store.submitAttempt({
      userId: 'demo-student',
      itemId: moduleSimulation.items[0].itemId,
      ...buildAttemptAnswer(moduleSimulation.items[0].itemId),
      sessionId: moduleSimulation.session.id,
      mode: 'exam',
      confidenceLevel: 3,
      responseTimeMs: 90000,
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown);
  assert.equal(thrown.statusCode, 409);
  assert.equal(thrown.payload.reason, 'exam_session_expired');
  assert.equal(thrown.payload.session.session.id, moduleSimulation.session.id);
  assert.equal(thrown.payload.session.timing.expired, true);
  assert.equal(thrown.payload.moduleSummary.expired, true);
  assert.equal(thrown.payload.moduleSummary.readinessSignal, 'expired_unfinished');
  assert.match(thrown.payload.moduleSummary.nextAction, /Time expired/i);
  assert.ok(store.getSession(moduleSimulation.session.id).ended_at);
});

test('api restores unfinished exam sessions across server restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-state-', async ({ stateFilePath }) => {
    let sessionId = null;
    let nextItemId = null;

    await withAuthedServer(async (baseUrl, sessions) => {
      const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      }).then((res) => res.json());

      sessionId = timedSet.session.id;

      const attempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({
          itemId: timedSet.currentItem.itemId,
          ...buildAttemptAnswer(timedSet.currentItem.itemId),
          sessionId,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 48000,
        }),
      }).then((res) => res.json());

      const activeAfterAttempt = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());
      nextItemId = activeAfterAttempt.activeSession.currentItem.itemId;
      assert.equal(attempt.sessionProgress.answered, 1);
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());

      assert.equal(active.hasActiveSession, true);
      assert.equal(active.resumeAvailable, true);
      assert.equal(active.resumeReason, 'unfinished_exam_session');
      assert.equal(active.activeSession.session.id, sessionId);
      assert.equal(active.activeSession.session.type, 'timed_set');
      assert.equal(active.activeSession.sessionProgress.answered, 1);
      assert.equal(active.activeSession.currentItem.itemId, nextItemId);
      assert.equal(active.activeSession.timedSummary.completed, false);
    }, { stateFilePath });
  });
});

test('api restores unfinished diagnostic sessions across server restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-diagnostic-state-', async ({ stateFilePath }) => {
    let sessionId = null;
    let nextItemId = null;

    await withAuthedServer(async (baseUrl, sessions) => {
      const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      }).then((res) => res.json());

      sessionId = diagnostic.session.id;

      const attempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({
          itemId: diagnostic.currentItem.itemId,
          ...buildAttemptAnswer(diagnostic.currentItem.itemId),
          sessionId,
          mode: 'learn',
          confidenceLevel: 4,
          responseTimeMs: 42000,
        }),
      }).then((res) => res.json());

      nextItemId = attempt.nextItem.itemId;
      assert.equal(attempt.sessionProgress.answered, 1);
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());

      assert.equal(active.hasActiveSession, true);
      assert.equal(active.resumeReason, 'unfinished_session');
      assert.equal(active.activeSession.session.id, sessionId);
      assert.equal(active.activeSession.session.type, 'diagnostic');
      assert.equal(active.activeSession.sessionProgress.answered, 1);
      assert.equal(active.activeSession.currentItem.itemId, nextItemId);
    }, { stateFilePath });
  });
});

test('api keeps completed session history and dashboard summaries across restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-complete-state-', async ({ stateFilePath }) => {
    let sessionId = null;

    await withAuthedServer(async (baseUrl, sessions) => {
      const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      }).then((res) => res.json());
      sessionId = timedSet.session.id;

      for (const [index, item] of timedSet.items.entries()) {
        await fetch(`${baseUrl}/api/attempt/submit`, {
          method: 'POST',
          headers: sessions.student.headers,
          body: JSON.stringify(buildAttemptBody(item, {
            sessionId,
            mode: 'exam',
            confidenceLevel: 3,
            responseTimeMs: 60000,
            selectedAnswer: index === 1 ? 'B' : 'A',
          })),
        }).then((res) => res.json());
      }

      const finished = await fetch(`${baseUrl}/api/timed-set/finish`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({ sessionId }),
      }).then((res) => res.json());

      assert.equal(finished.timedSummary.completed, true);
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());
      assert.equal(active.hasActiveSession, false);

      const history = await fetch(`${baseUrl}/api/sessions/history`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());
      const timedHistory = history.sessions.find((session) => session.sessionId === sessionId);
      assert.ok(timedHistory);
      assert.equal(timedHistory.status, 'complete');
      assert.equal(timedHistory.timedSummary.completed, true);

      const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());
      assert.equal(dashboard.latestTimedSetSummary.sessionId, sessionId);
      assert.equal(dashboard.latestTimedSetSummary.completed, true);
    }, { stateFilePath });
  });
});

test('api keeps reflections and teacher assignments across restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-support-state-', async ({ stateFilePath }) => {
    await withAuthedServer(async (baseUrl, sessions) => {
      const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      }).then((res) => res.json());

      const review = await fetch(`${baseUrl}/api/review/recommendations`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());

      const reflection = await fetch(`${baseUrl}/api/reflection/submit`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({
          sessionId: diagnostic.session.id,
          prompt: review.reflectionPrompt,
          response: 'I will slow down and verify the exact sentence role before choosing.',
        }),
      }).then((res) => res.json());
      assert.equal(reflection.saved, true);

      const assignment = await fetch(`${baseUrl}/api/teacher/assignments`, {
        method: 'POST',
        headers: sessions.teacher.headers,
        body: JSON.stringify({
          learnerId: 'demo-student',
          title: 'Sentence-role reset',
          objective: 'Reinforce sentence-role reading before the next timed block.',
          minutes: 15,
          focusSkill: 'rw_text_structure_and_purpose',
          mode: 'review',
        }),
      }).then((res) => res.json());
      assert.equal(assignment.saved, true);
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const review = await fetch(`${baseUrl}/api/review/recommendations`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());
      assert.equal(review.lastReflection.response, 'I will slow down and verify the exact sentence role before choosing.');

      const assignments = await fetch(`${baseUrl}/api/teacher/assignments?learnerId=demo-student`, {
        headers: sessions.teacher.headers,
      }).then((res) => res.json());
      assert.ok(assignments.saved.some((assignment) => assignment.title === 'Sentence-role reset'));
    }, { stateFilePath });
  });
});

test('api falls back safely when the persistence file is corrupted', async () => {
  await withPersistentStateFile('helix-sat-corrupt-state-', async ({ tempDir, stateFilePath }) => {
    await writeFile(stateFilePath, '{"mutableState": invalid-json');

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());

      assert.equal(active.hasActiveSession, false);
      assert.equal(active.activeSession, null);
    }, { stateFilePath });

    const files = await readdir(tempDir);
    assert.ok(files.some((name) => name.startsWith('prototype-state.json.corrupt-')));
  });
});

test('api falls back safely when the persistence file has a valid JSON envelope but invalid state shape', async () => {
  await withPersistentStateFile('helix-sat-invalid-shape-state-', async ({ tempDir, stateFilePath }) => {
    await writeFile(stateFilePath, JSON.stringify({
      mutableState: {
        sessions: [],
        attempts: {},
      },
    }, null, 2));

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, {
        headers: sessions.student.headers,
      }).then((res) => res.json());

      assert.equal(active.hasActiveSession, false);
      assert.equal(active.activeSession, null);
    }, { stateFilePath });

    const files = await readdir(tempDir);
    assert.ok(files.some((name) => name.startsWith('prototype-state.json.corrupt-')));
  });
});

test('api persists exam-session conflict telemetry in file-backed mode', async () => {
  await withPersistentStateFile('helix-sat-conflict-state-', async ({ stateFilePath }) => {
    await withAuthedServer(async (baseUrl, sessions) => {
      await fetch(`${baseUrl}/api/timed-set/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      }).then((res) => res.json());

      const conflict = await fetch(`${baseUrl}/api/module/start`, {
        method: 'POST',
        headers: sessions.student.headers,
        body: JSON.stringify({}),
      });

      assert.equal(conflict.status, 409);
    }, { stateFilePath });

    const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
    const events = persisted.mutableState?.events ?? [];
    assert.ok(events.some((event) => event.event_name === 'exam_session_resume_required'));
  });
});

test('file-backed state preserves itemExposure across reloads', async () => {
  await withPersistentStateFile('helix-sat-exposure-state-', async ({ stateFilePath }) => {
    const seed = createDemoData();
    const initialStore = createStore({
      seed,
      storage: createStateStorage({ seed, filePath: stateFilePath }),
    });

    const timedSet = initialStore.startTimedSet('demo-student');
    const exposedItemId = timedSet.currentItem.itemId;
    initialStore.submitAttempt({
      userId: 'demo-student',
      itemId: exposedItemId,
      ...buildAttemptAnswer(exposedItemId),
      sessionId: timedSet.session.id,
      mode: 'exam',
      confidenceLevel: 3,
      responseTimeMs: 42000,
    });

    const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
    assert.equal(persisted.mutableState.itemExposure[exposedItemId], 1);

    const reloadedState = createStateStorage({ seed, filePath: stateFilePath }).load();
    assert.equal(reloadedState.itemExposure[exposedItemId], 1);
  });
});
