import process from 'node:process'
import {
  DEFAULT_OPTIONS,
  VALID_COMPATIBILITIES,
  VALID_STRATEGIES,
} from '../constants'
import type {
  CompatibilityTarget,
  MergeStrategy,
  Options,
  ResolvedOptions,
} from '../types'
import { validateTargetVersion } from './compatibility/version'

/**
 * Validate a compatibility target, falling back to the default when empty.
 *
 * @param compatibility - User-provided compatibility target
 *
 * @returns Validated target or the default automatic detection mode
 *
 * @throws {Error} When the target is not supported
 */
function resolveCompatibility(compatibility?: string): CompatibilityTarget {
  if (!compatibility) {
    return DEFAULT_OPTIONS.compatibility
  }

  if (VALID_COMPATIBILITIES.includes(compatibility as CompatibilityTarget)) {
    return compatibility as CompatibilityTarget
  }

  throw new Error(
    `Invalid compatibility: ${compatibility}. Expected one of: ${VALID_COMPATIBILITIES.join(', ')}`,
  )
}

/**
 * Validate a conflict strategy, falling back to the default when empty.
 *
 * @param strategy - User-provided conflict strategy
 *
 * @returns Validated strategy or the default merge strategy
 *
 * @throws {Error} When the strategy is not supported
 */
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

/**
 * Resolve and normalize migration options with defaults.
 *
 * Apply defaults to migration preferences and validate the optional exact
 * target version against the selected compatibility major.
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
export function resolveOptions(options: Options = {}): ResolvedOptions {
  const compatibility = resolveCompatibility(options.compatibility)
  const targetVersion = validateTargetVersion(
    options.targetVersion,
    compatibility,
  )?.raw
  return {
    cleanNpmrc: options.cleanNpmrc ?? DEFAULT_OPTIONS.cleanNpmrc,
    compatibility,
    targetVersion,
    cwd: options.cwd ?? process.cwd(),
    newlineBetween: options.newlineBetween ?? DEFAULT_OPTIONS.newlineBetween,
    showChanges: options.showChanges ?? DEFAULT_OPTIONS.showChanges,
    sortKeys: options.sortKeys ?? DEFAULT_OPTIONS.sortKeys,
    strategy: resolveStrategy(options.strategy),
    yarnResolutions: options.yarnResolutions ?? DEFAULT_OPTIONS.yarnResolutions,
    cleanPackageJson:
      options.cleanPackageJson ?? DEFAULT_OPTIONS.cleanPackageJson,
    replaceDeprecated:
      options.replaceDeprecated ?? DEFAULT_OPTIONS.replaceDeprecated,
  }
}
