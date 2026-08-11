import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5176, strictPort: true, proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? (mode === 'isolated' ? 'http://127.0.0.1:3011' : 'http://127.0.0.1:3010'), changeOrigin: true } } },
  preview: { port: 4176, strictPort: true },
}))
