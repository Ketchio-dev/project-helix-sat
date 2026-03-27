import { extname, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function createHeaders(contentType, extraHeaders = {}, { noStore = false } = {}) {
  return {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    ...(noStore ? {
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
    } : {}),
    ...extraHeaders,
  };
}

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

export function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, createHeaders(MIME_TYPES['.json'], headers, { noStore: true }));
  response.end(JSON.stringify(payload, null, 2));
}

export class HttpError extends Error {
  constructor(statusCode, message, payload = null, headers = null) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.payload = payload;
    this.headers = headers;
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
    response.writeHead(
      200,
      createHeaders(MIME_TYPES[extname(filePath)] ?? 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store, max-age=0' }),
    );
    response.end(data);
    return true;
  } catch {
    throw new HttpError(404, 'Static asset not found');
  }
}
