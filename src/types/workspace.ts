import type { PnpmSettings } from '@pnpm/types'
import type { PnpmSettingsV12 } from './pnpm-v12'

/**
 * legacy `pnpm-workspace` types
 */
export interface PnpmWorkspaceLegacy {
  /**
   * Whether workspace projects share a lockfile. pnpm defaults to true.
   */
  sharedWorkspaceLockfile?: boolean
  /**
   * Editor schema reference preserved outside pnpm setting validation.
   */
  $schema?: string
  /**
   * Dependency versions in the default workspace catalog.
   */
  catalog?: Record<string, string>
  /**
   * Dependency version catalogs keyed by catalog name.
   */
  catalogs?: Record<string, Record<string, string>>
  /**
   * Workspace package directory globs, including negated exclusions.
   */
  packages?: string[]
}

/**
 * Deprecated `pnpm` settings in `package.json`
 * @see {@link https://github.com/pnpm/pnpm/blob/main/core/types/CHANGELOG.md#major-changes}
 */
export interface PnpmSettingsDeprecated {
  /**
   * @deprecated
   */
  auditConfig?: {
    /**
     * Legacy CVE exclusions copied to `ignoreGhsas` with a manual-update warning.
     */
    ignoreCves?: string[]
    /**
     * Advisory exclusions used by the structured `audit.ignore` replacement.
     */
    ignoreGhsas?: string[]
  }
  /**
   * @deprecated Use `audit.level` instead.
   */
  auditLevel?: 'critical' | 'high' | 'info' | 'low' | 'moderate'
  /**
   * @deprecated
   */
  allowNonAppliedPatches?: boolean
  /**
   * @deprecated Use `catalogPrune` instead.
   */
  cleanupUnusedCatalogs?: boolean
  /**
   * @deprecated
   */
  ignoredBuiltDependencies?: string[]
  /**
   * @deprecated
   */
  ignoreDepScripts?: boolean
  /**
   * @deprecated
   */
  ignorePatchFailures?: boolean
  /**
   * @deprecated
   */
  managePackageManagerVersions?: boolean
  /**
   * @deprecated
   */
  neverBuiltDependencies?: string[]
  /**
   * @deprecated
   */
  onlyBuiltDependencies?: string[]
  /**
   * @deprecated
   */
  onlyBuiltDependenciesFile?: string
  /**
   * @deprecated
   */
  packageManagerStrict?: boolean
  /**
   * @deprecated
   */
  packageManagerStrictVersion?: boolean
  /**
   * @deprecated
   */
  useNodeVersion?: string
  /**
   * @deprecated
   */
  executionEnv?: {
    /**
     * Legacy runtime version used when `useNodeVersion` is not configured.
     */
    nodeVersion?: string
    /**
     * Additional legacy execution environment fields present in the source.
     */
    [key: string]: unknown
  }
  /**
   * @deprecated Use `sideEffectsCache.read` and
   * `sideEffectsCache.write` instead.
   */
  sideEffectsCacheReadonly?: boolean
}

/**
 * Settings introduced in pnpm v11.
 */
export interface PnpmSettingsV11 {
  /**
   * Canonical replacement for the legacy `cleanupUnusedCatalogs` setting.
   */
  catalogPrune?: boolean
  /**
   * Module purge confirmation setting accepted by v11 and rejected by v12.
   */
  confirmModulesPurge?: boolean
  /**
   * Release-age exclusion pruning policy preserved by the v11 and v12 targets.
   */
  minimumReleaseAgeExcludePrune?: boolean
  /**
   * Per-project settings accepted by v11 and v12.4 as arrays or package-name maps.
   * v12.4 requires sharedWorkspaceLockfile: false.
   */
  packageConfigs?:
    | {
        /**
         * Package names matched by this project settings entry.
         */
        match: string[]
        /**
         * Project fields checked against the v11 `packageConfigs` allowlist.
         */
        [key: string]: unknown
      }[]
    | Record<string, Record<string, unknown>>
  /**
   * Package manager failure policy derived from legacy strictness settings.
   */
  pmOnFail?: 'download' | 'error' | 'ignore' | 'warn'
}

/**
 * `pnpm-workspace.yaml` types.
 */
export type PnpmWorkspace = Omit<PnpmSettings, 'tasks'> &
  PnpmSettingsDeprecated &
  PnpmSettingsV11 &
  PnpmSettingsV12 &
  PnpmWorkspaceLegacy
