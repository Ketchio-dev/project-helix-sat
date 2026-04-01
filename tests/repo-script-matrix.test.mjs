import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const reactPackage = JSON.parse(readFileSync('apps/web-react/package.json', 'utf8'));

test('root package exposes the required verification scripts', () => {
  const scripts = rootPackage.scripts ?? {};
  for (const name of ['check', 'check:contracts', 'check:web-react', 'check:ci-local', 'generate:contracts', 'smoke:learner']) {
    assert.ok(scripts[name], `missing root script: ${name}`);
  }
});

test('web-react package exposes a workspace check contract', () => {
  const scripts = reactPackage.scripts ?? {};
  for (const name of ['lint', 'build', 'test', 'check']) {
    assert.ok(scripts[name], `missing web-react script: ${name}`);
  }
});
