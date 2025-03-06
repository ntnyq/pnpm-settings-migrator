import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const __dirname: string = fileURLToPath(new URL('.', import.meta.url))

export const resolve = (...args: string[]): string =>
  path.resolve(__dirname, '..', ...args)
