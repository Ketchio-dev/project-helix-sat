import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoData } from './src/demo-data.mjs';
import { createRuntimeStore } from './src/runtime-store.mjs';
import { createRouter } from './src/router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_WEB_ROOT = join(__dirname, '../../apps/web/public');

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
  const server = await createAppServer();
  server.listen(port, () => {
    console.log(`Project Helix SAT prototype running at http://localhost:${port}`);
  });
}
