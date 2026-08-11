import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('src/main/index.ts'), external: ['electron', 'playwright-core'] } }, plugins: [externalizeDepsPlugin()] },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: { resolve: { alias: { '@': resolve('src/renderer/src') } }, plugins: [vue()] },
})
