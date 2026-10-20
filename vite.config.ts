import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/plugin.ts'],
    format: ['cjs'],
    platform: 'node',
    deps: { neverBundle: ['varlock', 'varlock/plugin-lib'] },
    outputOptions: { codeSplitting: false },
  },
  fmt: { semi: false, singleQuote: true },
  test: { testTimeout: 30000 },
})
