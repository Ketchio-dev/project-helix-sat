import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoData } from './src/demo-data.mjs';
import { createRuntimeStore } from './src/runtime-store.mjs';
import { createRouter } from './src/router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_WEB_ROOT = join(__dirname, '../../apps/web/public');
const REACT_WEB_ROOT = join(__dirname, '../../apps/web-react/dist');

// The React app is the promoted learner surface. `node server.mjs` / `npm start`
// serve it by default; set HELIX_WEB_CLIENT=legacy to serve the old shell, and
// if the React build is missing we fall back to legacy so the server still runs.
// (createAppServer's own default stays legacy so importers — tests, the legacy
// smoke, the dev API plugin — are unaffected unless they opt in.)
function resolveWebClient() {
  if ((process.env.HELIX_WEB_CLIENT ?? 'react') === 'legacy') {
    return { webRoot: LEGACY_WEB_ROOT, spaFallback: false, client: 'legacy' };
  }
  if (existsSync(join(REACT_WEB_ROOT, 'index.html'))) {
    return { webRoot: REACT_WEB_ROOT, spaFallback: true, client: 'react' };
  }
  return { webRoot: LEGACY_WEB_ROOT, spaFallback: false, client: 'legacy (react build missing)' };
}

export async function createAppServer({
  stateFilePath = process.env.HELIX_STATE_FILE ?? null,
  runtimeStoreOptions = {},
  // Static root to serve alongside the API. Defaults to the legacy shell; the
  // React build (apps/web-react/dist) opts in with spaFallback so client routes
  // (/practice, /session-review, …) resolve to index.html on deep link/refresh.
  webRoot = LEGACY_WEB_ROOT,
  spaFallback = false,
} = {}) {
  const seed = createDemoData();
  const store = await createRuntimeStore({ seed, stateFilePath, ...runtimeStoreOptions });
  const server = createServer(createRouter({ store, webRoot, spaFallback }));
  server.on('close', () => {
    Promise.resolve(store.dispose?.()).catch(() => {});
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4321);
  const { webRoot, spaFallback, client } = resolveWebClient();
  const server = await createAppServer({ webRoot, spaFallback });
  server.listen(port, () => {
    console.log(`Project Helix SAT running at http://localhost:${port} (web client: ${client})`);
  });
}
