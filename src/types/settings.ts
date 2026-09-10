import type { ResolvedPnpmTarget } from './compatibility'
import type { PnpmWorkspace } from './workspace'

/**
 * Reasons a setting cannot be moved to the selected destination.
 */
export interface SettingsIssues {
  /**
   * Settings recognized by a different pnpm version.
   */
  incompatible: string[]

  /**
   * Settings that must not be controlled by a project manifest.
   */
  refused: string[]

  /**
   * Settings written with a non-canonical manifest spelling.
   */
  nonCamelCase: string[]

  /**
   * Settings recognized by pnpm but unsupported by a narrower destination.
   */
  unsupported: string[]

  /**
   * Registry credentials, unsafe registry URLs, or dynamic proxy settings.
   */
  unsafe: string[]

  /**
   * Settings not recognized by the selected pnpm version.
   */
  unknown: string[]
}

/**
 * Result of selecting settings for a target workspace schema.
 */
export interface SelectedPnpmSettings {
  /**
   * Original keys selected for migration.
   */
  keys: string[]

  /**
   * Settings safe to write to the target workspace manifest.
   */
  settings: PnpmWorkspace

  /**
   * Settings left in their source, grouped by reason.
   */
  issues: SettingsIssues
}

/**
 * Options for narrowing settings to a specific manifest destination.
 */
export interface SelectPnpmSettingsOptions {
  /**
   * Optional destination-specific subset, such as `packageConfigs`.
   */
  allowedFields?: readonly string[]

  /**
   * Whether source keys use `.npmrc` kebab-case spelling.
   */
  npmrc?: boolean
}

/**
 * Setting value and destination restrictions needed to classify a rejection.
 */
export interface ResolveSettingIssueOptions {
  /**
   * Optional narrower allowlist imposed by the destination.
   */
  allowedFields?: ReadonlySet<string>
  /**
   * Concrete target used to distinguish refused and cross-version settings.
   */
  target: ResolvedPnpmTarget
  /**
   * Setting key after any `.npmrc` spelling conversion.
   */
  key: string
  /**
   * Whether the source permits `.npmrc` spelling instead of manifest casing.
   */
  npmrc: boolean
  /**
   * Setting value inspected for unsafe registry configuration.
   */
  value: unknown
}

/**
 * Context used to report settings retained in their source.
 */
export interface FormatSettingsIssuesOptions {
  /**
   * Concrete target used to explain cross-version settings.
   */
  target: ResolvedPnpmTarget

  /**
   * Issues produced by schema selection.
   */
  issues: SettingsIssues

  /**
   * Whether the destination is a `packageConfigs` entry.
   */
  projectConfig?: boolean

  /**
   * User-facing source file or property name.
   */
  source: string
}

/**
 * Before and after values for one changed root setting.
 */
export interface SettingsChange {
  /**
   * Setting value after migration.
   */
  after: unknown

  /**
   * Setting value before migration.
   */
  before: unknown

  /**
   * Root pnpm setting key.
   */
  key: string
}
