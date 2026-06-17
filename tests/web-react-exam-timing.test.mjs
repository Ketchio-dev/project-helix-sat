import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WARNING_THRESHOLD_SEC,
  hasExamTiming,
  resolveExpiresAtMs,
  computeRemainingSec,
  isExpired,
  formatCountdown,
} from '../apps/web-react/src/lib/examTiming.js';

const START = '2026-06-17T10:00:00.000Z';
const startMs = new Date(START).getTime();
// A 210s timed-set anchored at START expires here.
const EXPIRES = new Date(startMs + 210 * 1000).toISOString();

test('hasExamTiming only recognises a numeric server time limit', () => {
  assert.equal(hasExamTiming({ timeLimitSec: 210 }), true);
  assert.equal(hasExamTiming({ timeLimitSec: 0 }), true);
  assert.equal(hasExamTiming({ timeLimitSec: null }), false);
  assert.equal(hasExamTiming({}), false);
  assert.equal(hasExamTiming(null), false);
});

test('resolveExpiresAtMs prefers the authoritative absolute deadline', () => {
  const timing = { timeLimitSec: 210, expiresAt: EXPIRES, startedAt: START, remainingTimeSec: 5 };
  // expiresAt wins even when startedAt/remaining would imply something else.
  assert.equal(resolveExpiresAtMs(timing, startMs), startMs + 210 * 1000);
});

test('resolveExpiresAtMs falls back to startedAt + limit, then remaining', () => {
  assert.equal(
    resolveExpiresAtMs({ timeLimitSec: 210, startedAt: START }, startMs),
    startMs + 210 * 1000,
  );
  // No deadline anchor at all: anchor the reported remaining time to now.
  assert.equal(
    resolveExpiresAtMs({ timeLimitSec: 210, remainingTimeSec: 40 }, startMs),
    startMs + 40 * 1000,
  );
  assert.equal(resolveExpiresAtMs({ timeLimitSec: null }, startMs), null);
});

test('computeRemainingSec mirrors the deadline and clamps at zero', () => {
  const timing = { timeLimitSec: 210, expiresAt: EXPIRES };
  assert.equal(computeRemainingSec(timing, startMs), 210);
  assert.equal(computeRemainingSec(timing, startMs + 200 * 1000), 10);
  // Ceil: a partial last second still reads as 1.
  assert.equal(computeRemainingSec(timing, startMs + 209_500), 1);
  // Past the deadline never goes negative.
  assert.equal(computeRemainingSec(timing, startMs + 300 * 1000), 0);
  assert.equal(computeRemainingSec({ timeLimitSec: null }, startMs), null);
});

test('isExpired flips exactly at the deadline', () => {
  const timing = { timeLimitSec: 210, expiresAt: EXPIRES };
  assert.equal(isExpired(timing, startMs), false);
  assert.equal(isExpired(timing, startMs + 209_999), false);
  assert.equal(isExpired(timing, startMs + 210 * 1000), true);
  assert.equal(isExpired(timing, startMs + 999 * 1000), true);
  // Untimed sessions are never "expired".
  assert.equal(isExpired({ timeLimitSec: null }, startMs), false);
});

test('formatCountdown renders zero-padded MM:SS and guards bad input', () => {
  assert.equal(formatCountdown(210), '03:30');
  assert.equal(formatCountdown(65), '01:05');
  assert.equal(formatCountdown(9), '00:09');
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(formatCountdown(-5), '00:00');
  assert.equal(formatCountdown(null), '—');
  assert.equal(formatCountdown(undefined), '—');
});

test('the warning threshold is a stable 30s', () => {
  assert.equal(WARNING_THRESHOLD_SEC, 30);
});
