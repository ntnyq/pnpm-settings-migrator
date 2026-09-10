import type { Options, MergeStrategy, CompatibilityTarget } from '../types'

/**
 * Default values for migration options.
 */
export const DEFAULT_OPTIONS: Required<Omit<Options, 'cwd' | 'targetVersion'>> =
  {
    cleanNpmrc: true,
    cleanPackageJson: true,
    compatibility: 'auto',
    newlineBetween: true,
    replaceDeprecated: false,
    showChanges: true,
    sortKeys: false,
    strategy: 'merge',
    yarnResolutions: true,
  }

/**
 * Accepted conflict strategies used to validate migration options.
 */
export const VALID_STRATEGIES: MergeStrategy[] = [
  'discard',
  'merge',
  'overwrite',
]

/**
 * Accepted compatibility targets, including automatic version detection.
 */
export const VALID_COMPATIBILITIES: CompatibilityTarget[] = [
  'auto',
  'v10',
  'v11',
  'v12',
]
