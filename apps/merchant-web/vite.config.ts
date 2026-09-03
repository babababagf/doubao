import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: mode === 'mock' ? 5173 : 5174,
    strictPort: true,
    ...(mode !== 'mock' ? { proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? (mode === 'isolated' ? 'http://127.0.0.1:3011' : 'http://127.0.0.1:3010'), changeOrigin: true } } } : {}),
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}))
