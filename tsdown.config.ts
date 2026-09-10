import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: ['src/index.ts'],
    platform: 'node',
  },
  {
    clean: true,
    dts: false,
    entry: { cli: 'src/cli/index.ts' },
    platform: 'node',
  },
])
