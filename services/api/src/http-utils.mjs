import { extname, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export async function readJsonBody(request) {
  const MAX_BYTES = 32 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      throw new HttpError(413, 'Request body too large');
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Malformed JSON request body');
  }
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': MIME_TYPES['.json'] });
  response.end(JSON.stringify(payload, null, 2));
}

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export async function serveStaticFile(response, rootDir, pathname) {
  const target = pathname === '/' ? '/index.html' : pathname;
  const resolvedRoot = resolve(rootDir);
  const filePath = resolve(resolvedRoot, `.${target}`);
  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new HttpError(403, 'Forbidden path');
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] ?? 'text/plain; charset=utf-8' });
    response.end(data);
    return true;
  } catch {
    throw new HttpError(404, 'Static asset not found');
  }
}
