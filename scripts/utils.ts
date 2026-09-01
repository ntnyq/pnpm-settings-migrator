import path from 'node:path'

/**
 * Resolve a path from the repository root.
 *
 * @param args - Path segments relative to the repository root
 *
 * @returns Absolute path to the requested repository location
 */
export const resolve = (...args: string[]): string =>
  path.resolve(import.meta.dirname, '..', ...args)
