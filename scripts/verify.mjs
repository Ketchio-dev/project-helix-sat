import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const filesToCheck = [
  'services/api/server.mjs',
  'services/api/src/store.mjs',
  'services/api/src/router.mjs',
  'services/tutor/src/hint-engine.mjs',
  'packages/assessment/src/daily-plan-generator.mjs',
  'packages/scoring/src/score-predictor.mjs',
  'apps/web/public/app.js',
];

for (const file of filesToCheck) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

const manifestPath = join(process.cwd(), 'dist', 'verify-manifest.json');
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify({ built_at: new Date().toISOString(), files_checked: filesToCheck }, null, 2));
console.log(`Verification completed. Manifest written to ${manifestPath}`);
