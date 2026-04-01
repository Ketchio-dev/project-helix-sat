import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

test('react learner app uses the shared api client for /api calls', () => {
  const sourceFiles = collectSourceFiles('apps/web-react/src');
  const offenders = sourceFiles.filter((file) => /fetch\s*\(\s*['"]\/api\//.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, [], `direct /api fetch bypasses remain in: ${offenders.join(', ')}`);
});

test('shared web-react api helper enforces generated contract path allowlist', () => {
  const apiSource = readFileSync('apps/web-react/src/api.js', 'utf8');

  assert.match(
    apiSource,
    /openapi-contract\.generated\.json/,
    'api helper must consume generated contract artifact',
  );
  assert.match(
    apiSource,
    /CONTRACT_PATHS\.has\(contractPath\)/,
    'api helper must enforce generated contract endpoint allowlist',
  );
});
