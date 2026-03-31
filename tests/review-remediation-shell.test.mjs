import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');

test('supported learner shell renders remediation card as instructional contract', () => {
  assert.match(appSource, /Misconception:/);
  assert.match(appSource, /Decisive clue:/);
  assert.match(appSource, /Correction rule:/);
  assert.match(appSource, /Revisit next:/);
});

test('supported learner shell keeps retry or near-transfer as primary review action', () => {
  assert.match(appSource, /Start retry loop/);
  assert.match(appSource, /Start near-transfer/);
  assert.match(appSource, /getRemediationPrimaryAction/);
});
