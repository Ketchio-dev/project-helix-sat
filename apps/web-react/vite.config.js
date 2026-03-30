import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.HELIX_API_PROXY_TARGET?.trim()
  const webPort = Number(env.HELIX_WEB_PORT || 5173)
  const useEmbeddedApi = command === 'serve' && !apiProxyTarget
  const embeddedApiPlugin = useEmbeddedApi
    ? (await import('./dev-api-plugin.mjs')).helixDevApiPlugin({ stateFilePath: env.HELIX_STATE_FILE || null })
    : null

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(embeddedApiPlugin ? [embeddedApiPlugin] : []),
    ],
    server: {
      port: webPort,
      ...(command === 'serve' && apiProxyTarget
        ? {
            proxy: {
              '/api': apiProxyTarget,
              '/health': apiProxyTarget,
            },
          }
        : {}),
    },
  }
})
