import process from 'node:process'

export interface Options {
  /**
   * Whether to remove pnpm settings in `.npmrc` file
   *
   * @default true
   */
  cleanNpmrc?: boolean

  /**
   * Whether to remove `pnpm` field in `package.json`
   *
   * @default true
   */
  cleanPackageJson?: boolean

  /**
   * Current working directory
   *
   * @default process.cwd()
   */
  cwd?: string

  /**
   * Add newlines between each root keys like pnpm does
   * @default true
   */
  newlineBetween?: boolean

  /**
   * Sort keys when write `pnpm-workspace.yaml`
   *
   * @default false
   */
  sortKeys?: boolean

  /**
   * Strategy to handle conflicts
   */
  strategy?: 'discard' | 'merge' | 'overwrite'

  /**
   * Whether to migrate `resolutions` filed in `package.json`
   *
   * @default true
   */
  yarnResolutions?: boolean
}

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
    strategy: options.strategy ?? DEFAULT_OPTIONS.strategy,
    yarnResolutions: options.yarnResolutions ?? DEFAULT_OPTIONS.yarnResolutions,
    cleanPackageJson:
      options.cleanPackageJson ?? DEFAULT_OPTIONS.cleanPackageJson,
  }
}
