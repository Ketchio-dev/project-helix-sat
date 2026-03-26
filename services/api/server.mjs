import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/store.mjs';
import { createRouter } from './src/router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../../apps/web/public');

export function createAppServer() {
  const store = createStore();
  return createServer(createRouter({ store, webRoot }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4321);
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`Project Helix SAT prototype running at http://localhost:${port}`);
  });
}
