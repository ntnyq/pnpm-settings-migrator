import type { ResolvedPnpmTarget } from './compatibility'
import type { SettingsIssues } from './settings'

/**
 * Migratable settings and their original `.npmrc` keys.
 */
export interface MigratableNpmrc {
  /**
   * Original keys of settings selected for migration.
   */
  keys: string[]

  /**
   * Settings left in `.npmrc`, grouped by the reason they cannot be migrated.
   */
  issues: SettingsIssues

  /**
   * Parsed settings converted to camelCase keys.
   */
  settings: NpmRC
}

/**
 * Options for narrowing `.npmrc` migration to a destination schema.
 */
export interface ReadMigratableNpmrcOptions {
  /**
   * Optional subset accepted by the destination, such as `packageConfigs`.
   */
  allowedFields?: readonly string[]
}

/**
 * Effective workspace capabilities used when collecting project settings.
 */
export interface ReadProjectNpmrcOptions {
  /**
   * Concrete pnpm target selected for this migration.
   */
  target: ResolvedPnpmTarget
  /**
   * Lockfile mode after merging root sources with existing settings.
   */
  sharedWorkspaceLockfile?: boolean
}

/**
 * A subproject `.npmrc` inspected for `packageConfigs` migration.
 */
export interface ProjectNpmrcMigration {
  /**
   * Parsed settings and keys selected for this project.
   */
  migratable: MigratableNpmrc

  /**
   * Absolute path to the project's `.npmrc`.
   */
  npmrcPath: string

  /**
   * Package name used as the `packageConfigs` key.
   */
  projectName: string
}

/**
 * Result of collecting all subproject `.npmrc` files in a workspace.
 */
export interface ProjectNpmrcMigrations {
  /**
   * Settings keyed by package name, ready to merge into `packageConfigs`.
   */
  packageConfigs: Record<string, NpmRC>

  /**
   * Per-file metadata used for warnings and safe cleanup.
   */
  projects: ProjectNpmrcMigration[]

  /**
   * Discovery warnings that leave source files untouched.
   */
  warnings: string[]
}

/**
 * Named workspace project with an `.npmrc`, pending duplicate-name checks.
 */
export interface ProjectManifestCandidate {
  /**
   * Absolute path to the discovered project's `.npmrc`.
   */
  npmrcPath: string
  /**
   * Absolute manifest path used to identify duplicate-name conflicts.
   */
  packageJsonPath: string
  /**
   * Declared package name used for `packageConfigs` matching.
   */
  projectName: string
}

/**
 * `.npmrc` types.
 */
export type NpmRC = Record<string, any>
