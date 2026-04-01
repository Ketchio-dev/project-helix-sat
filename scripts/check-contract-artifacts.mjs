import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderManifestJson } from './lib/contract-artifact-utils.mjs';

const outputPath = join(process.cwd(), 'packages/sdk/generated/openapi-contract.generated.json');
const expected = renderManifestJson();

if (!existsSync(outputPath)) {
  console.error(`Missing generated contract artifact: ${outputPath}`);
  console.error('Run `npm run generate:contracts` and commit the result.');
  process.exit(1);
}

const actual = readFileSync(outputPath, 'utf8');
if (actual !== expected) {
  console.error('Generated contract artifact is stale.');
  console.error('Run `npm run generate:contracts` and commit the updated artifact.');
  process.exit(1);
}

console.log('Contract artifacts are up to date.');
