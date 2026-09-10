import type { ResolvedPackageJsonSettings, ParsedPackageJson } from './config'
import type { MigratableNpmrc, ProjectNpmrcMigrations } from './npmrc'
import type { CompatibilityTarget, MergeStrategy } from './options'
import type { PackageJson } from './package-json'
import type { SettingsChange } from './settings'
import type { PnpmWorkspace } from './workspace'

/**
 * Sources and merged incoming settings resolved for one migration.
 */
export interface MigrationSources {
  /**
   * Source selection and project discovery warnings in discovery order.
   */
  warnings: string[]
  /**
   * Combined legacy settings before compatibility normalization.
   */
  incomingSettings: PnpmWorkspace
  /**
   * Root `.npmrc` settings and original keys used for cleanup.
   */
  npmrc: MigratableNpmrc
  /**
   * Selected package settings and Yarn resolutions cleanup metadata.
   */
  packageJson: ResolvedPackageJsonSettings
  /**
   * Subproject settings and source metadata for `packageConfigs` migration.
   */
  projectNpmrcs: ProjectNpmrcMigrations
}

/**
 * Context needed to collect legacy settings sources.
 */
export interface ResolveMigrationSourcesOptions {
  /**
   * Concrete target used to select supported source settings.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  /**
   * Workspace root used to discover subprojects and format source paths.
   */
  cwd: string
  /**
   * Whether the root `.npmrc` should be read.
   */
  npmrcExists: boolean
  /**
   * Absolute path to the root `.npmrc`.
   */
  npmrcPath: string
  /**
   * Parsed root package manifest containing legacy settings.
   */
  packageJson: PackageJson
  /**
   * Existing workspace settings used to resolve effective package patterns.
   */
  pnpmWorkspace: PnpmWorkspace
  /**
   * Conflict strategy used when resolving workspace package patterns.
   */
  strategy: MergeStrategy
  /**
   * Whether to select Yarn resolutions for conversion to pnpm overrides.
   */
  yarnResolutions: boolean
}

/**
 * Files and cleanup policy needed to persist one migration.
 */
export interface PersistMigrationOptions {
  /**
   * Whether to prune applied keys from root and project `.npmrc` files.
   */
  cleanNpmrc: boolean
  /**
   * Whether to remove applied legacy settings from the package manifest.
   */
  cleanPackageJson: boolean
  /**
   * Concrete target controlling cleanup of empty `.npmrc` files.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  /**
   * Merged destination settings used to verify source values were preserved.
   */
  finalSettings: PnpmWorkspace
  /**
   * Combined source settings after compatibility normalization.
   */
  incomingSettings: PnpmWorkspace
  /**
   * Root `.npmrc` settings and original keys selected for migration.
   */
  npmrc: MigratableNpmrc
  /**
   * Whether a root `.npmrc` exists for cleanup.
   */
  npmrcExists: boolean
  /**
   * Absolute path to the root `.npmrc`.
   */
  npmrcPath: string
  /**
   * Mutable package manifest and indentation used when writing it back.
   */
  packageJson: ParsedPackageJson
  /**
   * Whether the package manifest exists and can be persisted.
   */
  packageJsonExists: boolean
  /**
   * Absolute path to the root package manifest.
   */
  packageJsonPath: string
  /**
   * Whether runtime migration already mutated the package manifest.
   */
  packageJsonRuntimeChanged: boolean
  /**
   * Selected package settings before normalization, used to verify cleanup.
   */
  packageJsonSettings: ResolvedPackageJsonSettings
  /**
   * Serialized workspace YAML with the requested formatting applied.
   */
  pnpmWorkspaceContent: string
  /**
   * Absolute path to the destination workspace manifest.
   */
  pnpmWorkspacePath: string
  /**
   * Project source files and values to compare against final `packageConfigs`.
   */
  projectNpmrcs: ProjectNpmrcMigrations
  /**
   * Selected Node.js version that source runtime declarations must match.
   */
  runtimeVersion?: string
}

/**
 * Source keys and destination state used to decide which root settings to prune.
 */
export interface SelectAppliedRootKeysOptions {
  /**
   * Workspace settings after applying the conflict strategy.
   */
  finalSettings: PnpmWorkspace
  /**
   * Combined source settings after normalization and replacement.
   */
  incomingSettings: PnpmWorkspace
  /**
   * Original source keys selected for migration.
   */
  keys: string[]
  /**
   * Whether keys need `.npmrc` spelling and Node.js mirror handling.
   */
  npmrc?: boolean
  /**
   * Whether the selected runtime was applied to the package manifest.
   */
  runtimeApplied: boolean
  /**
   * Runtime version selected under the conflict strategy.
   */
  runtimeVersion?: string
  /**
   * Source values before normalization, used to check runtime equality.
   */
  sourceSettings: object
}

/**
 * Migration outcome fields determined by destination writes and source cleanup.
 */
export type PersistenceResult = Pick<
  MigrationResult,
  'changedFiles' | 'sourceSettingsCleaned' | 'packageJsonRuntimeChanged'
>

/**
 * Completed migration outcome, independent of CLI display preferences.
 */
export interface MigrationResult {
  /**
   * Whether any root configuration file was found.
   */
  hasConfigurationFiles: boolean

  /**
   * Changed root settings in pnpm-workspace.yaml.
   */
  settingsChanges: SettingsChange[]

  /**
   * Absolute paths of files whose contents changed or that were created or removed.
   */
  changedFiles: string[]

  /**
   * Whether applied legacy settings were removed from any source file.
   */
  sourceSettingsCleaned: boolean

  /**
   * Whether the Node.js runtime destination in package.json changed.
   */
  packageJsonRuntimeChanged: boolean

  /**
   * Issues requiring attention, in discovery order.
   */
  warnings: string[]
}
