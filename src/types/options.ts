/**
 * Compatibility target used by the migrator.
 */
export type CompatibilityTarget = 'auto' | 'v10' | 'v11' | 'v12'

/**
 * Merge strategy for combining pnpm settings.
 */
export type MergeStrategy = 'discard' | 'merge' | 'overwrite'

/**
 * Options for pnpm settings migration
 */
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
   * pnpm compatibility target.
   * - `auto`: detect from `packageManager` (fallback to `v10`)
   * - `v10`: keep legacy v10 settings
   * - `v11`: normalize to v11-compatible settings
   * - `v12`: normalize to v12-compatible settings
   *
   * @default 'auto'
   */
  compatibility?: CompatibilityTarget

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
   * Replace deprecated settings with new ones and remove deprecated keys.
   *
   * @default false
   */
  replaceDeprecated?: boolean

  /**
   * Whether the CLI shows a settings diff after migration.
   * Library calls always return changes without printing output.
   *
   * @default true
   */
  showChanges?: boolean

  /**
   * Sort keys when write `pnpm-workspace.yaml`
   *
   * @default false
   */
  sortKeys?: boolean

  /**
   * Strategy to handle conflicts
   */
  strategy?: MergeStrategy

  /**
   * Whether to migrate `resolutions` filed in `package.json`
   *
   * @default true
   */
  yarnResolutions?: boolean
}
