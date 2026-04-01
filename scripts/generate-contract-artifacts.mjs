import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderManifestJson } from './lib/contract-artifact-utils.mjs';

const outputPath = join(process.cwd(), 'packages/sdk/generated/openapi-contract.generated.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, renderManifestJson());
console.log(`Generated contract artifact: ${outputPath}`);
