import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDemoData } from '../../services/api/src/demo-data.mjs';
import { createRouter } from '../../services/api/src/router.mjs';
import { createStateStorage } from '../../services/api/src/state-storage.mjs';
import { createStore } from '../../services/api/src/store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyWebRoot = join(__dirname, '../web/public');

export function helixDevApiPlugin({ stateFilePath = process.env.HELIX_STATE_FILE ?? null } = {}) {
  const seed = createDemoData();
  const storage = createStateStorage({ seed, filePath: stateFilePath });
  const store = createStore({ seed, storage });
  const handler = createRouter({ store, webRoot: legacyWebRoot });

  return {
    name: 'helix-dev-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? '').split('?')[0];
        if (pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/')) {
          handler(request, response);
          return;
        }
        next();
      });
    },
  };
}
