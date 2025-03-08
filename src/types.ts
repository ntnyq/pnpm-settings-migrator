import type { PnpmSettings } from '@pnpm/types'

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
