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
  pnpm?: PnpmSettings
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
