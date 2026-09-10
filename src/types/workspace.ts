import type { PnpmSettings } from '@pnpm/types'

/**
 * legacy `pnpm-workspace` types
 */
export interface PnpmWorkspaceLegacy {
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
   * Per-project settings accepted by v11 as matcher arrays or package-name maps.
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
 * Policy used by pnpm v12's project-aware global shims.
 */
export type GlobalShimPolicy = boolean | 'always' | 'auto' | 'prompt'

/**
 * Settings introduced in pnpm v12.
 */
export interface PnpmSettingsV12 {
  /**
   * Peer auto-installation policy accepted only by the v12 target.
   */
  autoInstallPeersFromHighestMatch?: boolean
  /**
   * External dependency names accepted only by the v12 target.
   */
  externalDependencies?: string[]
  /**
   * Project-aware global shim policies, or `false` to disable global shims.
   */
  globalShims?: false | Record<string, GlobalShimPolicy>
}

/**
 * `pnpm-workspace.yaml` types.
 */
export type PnpmWorkspace = PnpmSettings &
  PnpmSettingsDeprecated &
  PnpmSettingsV11 &
  PnpmSettingsV12 &
  PnpmWorkspaceLegacy
