import type { PnpmSettings } from '@pnpm/types'

/**
 * Merge strategy for combining pnpm settings
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
  strategy?: MergeStrategy

  /**
   * Whether to migrate `resolutions` filed in `package.json`
   *
   * @default true
   */
  yarnResolutions?: boolean
}

/**
 * legacy `pnpm-workspace` types
 */
export type PnpmWorkspaceLegacy = {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
  packages?: string[]
}

/**
 * `package-json` types
 * @pg
 */
export interface PackageJson {
  /**
   * same as `pnpm.overrides`
   *
   * @compatibility npm, bun
   */
  overrides?: Record<string, string>

  /**
   * pnpm settings
   */
  pnpm?: PnpmSettings

  /**
   * same as `pnpm.overrides`
   *
   * @compatibility yarn, bun
   */
  resolutions?: Record<string, string>
}

/**
 * `.npmrc` types
 * @pg
 */
export type NpmRC = Record<string, any>

/**
 * `pnpm-workspace` types
 * @pg
 */
export type PnpmWorkspace = PnpmSettings & PnpmWorkspaceLegacy
