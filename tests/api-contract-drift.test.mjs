import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('generated contract artifact exists in the SDK surface', () => {
  assert.ok(
    existsSync('packages/sdk/generated/openapi-contract.generated.json'),
    'missing generated OpenAPI contract artifact; run `npm run generate:contracts`',
  );
});

test('generated contract artifact tracks current canonical endpoints', () => {
  const generated = JSON.parse(readFileSync('packages/sdk/generated/openapi-contract.generated.json', 'utf8'));
  assert.ok(generated?.openapi?.paths?.includes('/api/goal-profile'));
  assert.ok(generated?.openapi?.paths?.includes('/api/session/active'));
  assert.ok(generated?.openapi?.paths?.includes('/api/attempt/submit'));
});

test('web-react store no longer tolerates deprecated snake_case/cross-alias contract fields', () => {
  const storeSource = readFileSync('apps/web-react/src/store.js', 'utf8');
  const disallowedAliases = [
    'target_score',
    'target_test_date',
    'daily_minutes',
    'self_reported_weak_area',
    'next_best_action',
    'diagnostic_reveal',
    'latest_session_outcome',
    'session_id',
    'current_item',
    'first_item',
    'item_id',
    'session_type',
    'cta_label',
    'estimated_minutes',
    'correct_answer',
    'next_item',
    'session_complete',
  ];

  for (const alias of disallowedAliases) {
    assert.equal(
      storeSource.includes(alias),
      false,
      `unsupported alias fallback should be removed from web-react store: ${alias}`,
    );
  }
});
