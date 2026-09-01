import type { PnpmSettings } from '@pnpm/types'

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
   * Whether to show a settings diff after migration
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

/**
 * legacy `pnpm-workspace` types
 */
export interface PnpmWorkspaceLegacy {
  $schema?: string
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
  packages?: string[]
}

/**
 * `package.json` types.
 */
export interface PackageJson {
  /**
   * Development tool declarations.
   */
  devEngines?: {
    packageManager?: PackageManagerEngine | PackageManagerEngine[]
    runtime?: RuntimeEngine | RuntimeEngine[]
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
 * `.npmrc` types.
 */
export type NpmRC = Record<string, any>

/**
 * Package manager declaration stored in
 * `package.json#devEngines.packageManager`.
 */
export interface PackageManagerEngine {
  name: string
  onFail?: 'download' | 'error' | 'ignore' | 'warn'
  version?: string
}

/**
 * Runtime declaration stored in `package.json#devEngines.runtime`.
 */
export interface RuntimeEngine {
  name: string
  onFail?: 'download' | 'error' | 'ignore' | 'warn'
  version: string
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
    ignoreCves?: string[]
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
    nodeVersion?: string
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
  catalogPrune?: boolean
  confirmModulesPurge?: boolean
  minimumReleaseAgeExcludePrune?: boolean
  packageConfigs?:
    | {
        match: string[]
        [key: string]: unknown
      }[]
    | Record<string, Record<string, unknown>>
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
  autoInstallPeersFromHighestMatch?: boolean
  externalDependencies?: string[]
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
