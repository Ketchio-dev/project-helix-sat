import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoData } from './src/demo-data.mjs';
import { createRuntimeStore } from './src/runtime-store.mjs';
import { createRouter } from './src/router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../../apps/web/public');

export async function createAppServer({
  stateFilePath = process.env.HELIX_STATE_FILE ?? null,
  runtimeStoreOptions = {},
} = {}) {
  const seed = createDemoData();
  const store = await createRuntimeStore({ seed, stateFilePath, ...runtimeStoreOptions });
  const server = createServer(createRouter({ store, webRoot }));
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
