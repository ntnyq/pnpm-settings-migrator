import process from 'node:process'
import type { MergeStrategy, Options } from './types'

/**
 * Default values for migration options.
 */
const DEFAULT_OPTIONS: Required<Options> = {
  cleanNpmrc: true,
  cleanPackageJson: true,
  cwd: process.cwd(),
  newlineBetween: true,
  sortKeys: false,
  strategy: 'merge',
  yarnResolutions: true,
}

const VALID_STRATEGIES: MergeStrategy[] = ['discard', 'merge', 'overwrite']

/**
 * Resolve and normalize migration options with defaults.
 *
 * This function takes partial options and returns a complete options object
 * with all properties set to either the provided value or the default value.
 *
 * @param options - Partial migration options
 *
 * @returns Complete options object with all required properties
 *
 * @example
 * ```ts
 * // Use all defaults
 * const opts = resolveOptions()
 * // { cleanNpmrc: true, cleanPackageJson: true, cwd: '/current/dir', ... }
 *
 * // Override specific options
 * const opts = resolveOptions({ sortKeys: true, cleanNpmrc: false })
 * // { cleanNpmrc: false, cleanPackageJson: true, sortKeys: true, ... }
 * ```
 */
export function resolveOptions(options: Options = {}): Required<Options> {
  return {
    cleanNpmrc: options.cleanNpmrc ?? DEFAULT_OPTIONS.cleanNpmrc,
    cwd: options.cwd ?? DEFAULT_OPTIONS.cwd,
    newlineBetween: options.newlineBetween ?? DEFAULT_OPTIONS.newlineBetween,
    sortKeys: options.sortKeys ?? DEFAULT_OPTIONS.sortKeys,
    strategy: resolveStrategy(options.strategy),
    yarnResolutions: options.yarnResolutions ?? DEFAULT_OPTIONS.yarnResolutions,
    cleanPackageJson:
      options.cleanPackageJson ?? DEFAULT_OPTIONS.cleanPackageJson,
  }
}

function resolveStrategy(strategy?: string): MergeStrategy {
  if (!strategy) {
    return DEFAULT_OPTIONS.strategy
  }

  if (VALID_STRATEGIES.includes(strategy as MergeStrategy)) {
    return strategy as MergeStrategy
  }

  throw new Error(
    `Invalid strategy: ${strategy}. Expected one of: ${VALID_STRATEGIES.join(', ')}`,
  )
}
