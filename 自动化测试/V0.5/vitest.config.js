import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const configDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(configDir, '../..')

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['自动化测试/V0.5/tests/setup.js'],
    include: ['自动化测试/V0.5/tests/**/*.{test,spec}.{js,jsx}'],
    exclude: ['自动化测试/V0.5/tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
})
