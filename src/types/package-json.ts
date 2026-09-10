import type { PnpmWorkspace } from './workspace'

/**
 * `package.json` types.
 */
export interface PackageJson {
  /**
   * Development tool declarations.
   */
  devEngines?: {
    /**
     * Package manager declarations used as fallback compatibility hints.
     */
    packageManager?: PackageManagerEngine | PackageManagerEngine[]
    /**
     * Runtime declarations preserved when legacy Node.js settings conflict.
     */
    runtime?: RuntimeEngine | RuntimeEngine[]
    /**
     * Other development engine declarations preserved during migration.
     */
    [key: string]: unknown
  }

  /**
   * Package name used by pnpm workspace project matching.
   */
  name?: string

  /**
   * same as `pnpm.overrides`
   *
   * Compatible with npm and Bun.
   */
  overrides?: Record<string, string>

  /**
   * Package manager declaration, for example `pnpm@11.0.0`
   */
  packageManager?: string

  /**
   * pnpm settings
   */
  pnpm?: PnpmWorkspace

  /**
   * same as `pnpm.overrides`
   *
   * Compatible with Yarn and Bun.
   */
  resolutions?: Record<string, string>
}

/**
 * Package manager declaration stored in
 * `package.json#devEngines.packageManager`.
 */
export interface PackageManagerEngine {
  /**
   * Package manager name; only `pnpm` contributes a compatibility hint.
   */
  name: string
  /**
   * Failure policy preserved with the package manager declaration.
   */
  onFail?: 'download' | 'error' | 'ignore' | 'warn'
  /**
   * Version declaration inspected to infer the pnpm compatibility target.
   */
  version?: string
}

/**
 * Runtime declaration stored in `package.json#devEngines.runtime`.
 */
export interface RuntimeEngine {
  /**
   * Runtime name; migrated Node.js versions use `node`.
   */
  name: string
  /**
   * Failure policy preserved with an existing runtime declaration.
   */
  onFail?: 'download' | 'error' | 'ignore' | 'warn'
  /**
   * Runtime version declaration, including migrated legacy Node.js versions.
   */
  version: string
}
