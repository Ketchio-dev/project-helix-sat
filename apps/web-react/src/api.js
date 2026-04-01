import contractArtifact from '../../../packages/sdk/generated/openapi-contract.generated.json';

const BASE = '/api';
const CONTRACT_PATHS = new Set(contractArtifact?.openapi?.paths ?? []);

function assertContractPath(path) {
  const contractPath = `${BASE}${path}`;
  if (!CONTRACT_PATHS.has(contractPath)) {
    throw new Error(`Unsupported API path outside generated contract: ${contractPath}`);
  }
}

async function request(path, options = {}) {
  assertContractPath(path);
  const url = `${BASE}${path}`;
  const config = {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(url, config);

  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const fallbackMessage = res.status === 502
      ? 'API server is unavailable. Start the Helix API or use the Vite dev server with the built-in API middleware.'
      : `Request failed: ${res.status}`;
    throw new Error(text || fallbackMessage);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
};

export const apiContract = {
  paths: CONTRACT_PATHS,
  supportsPath(path) {
    return CONTRACT_PATHS.has(`${BASE}${path}`);
  },
};
