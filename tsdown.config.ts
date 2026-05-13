import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    clean: true,
    entry: ['src/index.ts'],
    platform: 'node',
    dts: {
      tsgo: true,
    },
  },
  {
    clean: true,
    dts: false,
    entry: ['src/cli.ts'],
    platform: 'node',
  },
])
