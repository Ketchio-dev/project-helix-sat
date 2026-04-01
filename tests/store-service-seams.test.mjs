import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../services/api/src/store.mjs';

test('store keeps auth/planning/session/support seams behaviorally stable', () => {
  const store = createStore();

  const registered = store.registerUser({
    name: 'Seam Student',
    email: `seam-student-${Date.now()}@example.com`,
    password: 'pass1234',
  });
  assert.equal(registered.user.role, 'student');

  const loggedIn = store.loginUser({ email: registered.user.email, password: 'pass1234' });
  assert.equal(loggedIn.user.id, registered.user.id);

  const plan = store.getPlan(registered.user.id);
  assert.equal(plan.status, 'needs_diagnostic');

  const timedSet = store.startTimedSet('demo-student');
  const activeSession = store.getActiveSession('demo-student');
  assert.equal(activeSession.hasActiveSession, true);
  assert.equal(activeSession.resumeReason, 'unfinished_exam_session');
  assert.equal(activeSession.activeSession.session.id, timedSet.session.id);

  const reflection = store.submitReflection({ userId: registered.user.id, response: 'I need to verify setup first.' });
  assert.equal(reflection.saved, true);

  const assignment = store.saveTeacherAssignment({
    userId: 'demo-teacher',
    learnerId: registered.user.id,
    title: 'Repair loop',
    objective: 'Fix equation setup misses',
    minutes: 15,
    focusSkill: 'math_linear_equations',
    mode: 'review',
    rationale: 'Keep support lane tight to the same trap family.',
  });
  assert.equal(assignment.saved, true);
  assert.equal(assignment.assignment.learnerId, registered.user.id);
});
