import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();
const openapiPath = join(rootDir, 'services/api/openapi.yaml');
const schemasRoot = join(rootDir, 'packages/schemas');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, found);
      continue;
    }
    found.push(fullPath);
  }
  return found;
}

function extractOpenApiPaths(source) {
  return [...source.matchAll(/^  (\/[^:]+):$/gm)].map((match) => match[1]).sort();
}

function extractSchemaRefs(source) {
  const refs = [];
  const ignoredKeys = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']);
  let inComponents = false;
  let inSchemas = false;

  for (const line of source.split('\n')) {
    if (line.startsWith('components:')) {
      inComponents = true;
      inSchemas = false;
      continue;
    }

    if (inComponents && /^  [A-Za-z]/.test(line) && line.trim() !== 'schemas:') {
      inComponents = false;
      inSchemas = false;
    }

    if (inComponents && line.trim() === 'schemas:') {
      inSchemas = true;
      continue;
    }

    if (inSchemas && /^    [A-Za-z0-9_]+:$/.test(line)) {
      const candidate = line.trim().slice(0, -1);
      if (!ignoredKeys.has(candidate)) {
        refs.push(candidate);
      }
      continue;
    }

    if (inSchemas && /^  [A-Za-z]/.test(line)) {
      inSchemas = false;
    }
  }

  return refs.sort();
}

export function buildContractManifest() {
  const openapiSource = readFileSync(openapiPath, 'utf8');
  const schemaFiles = walk(schemasRoot)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const schemas = schemaFiles.map((filePath) => {
    const source = readFileSync(filePath, 'utf8');
    return {
      file: relative(rootDir, filePath),
      sha256: sha256(source),
    };
  });

  return {
    contractVersion: 1,
    source: {
      openapi: relative(rootDir, openapiPath),
      schemasRoot: relative(rootDir, schemasRoot),
    },
    openapi: {
      sha256: sha256(openapiSource),
      pathCount: extractOpenApiPaths(openapiSource).length,
      paths: extractOpenApiPaths(openapiSource),
      schemaRefCount: extractSchemaRefs(openapiSource).length,
      schemaRefs: extractSchemaRefs(openapiSource),
    },
    schemas: {
      count: schemas.length,
      files: schemas,
      combinedSha256: sha256(JSON.stringify(schemas)),
    },
  };
}

export function renderManifestJson() {
  return `${JSON.stringify(buildContractManifest(), null, 2)}\n`;
}
