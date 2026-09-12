import type { Document } from 'yaml'
import type { PackageJson } from './package-json'
import type { SettingsIssues } from './settings'
import type { PnpmWorkspace } from './workspace'

/**
 * Parsed `package.json` content and its detected indentation.
 */
export interface ParsedPackageJson {
  /**
   * Indentation used by the source JSON file.
   */
  indent: number | string

  /**
   * Parsed package manifest.
   */
  value: PackageJson
}

/**
 * Parsed pnpm workspace content and its detected indentation width.
 */
export interface ParsedPnpmWorkspace {
  /**
   * Parsed YAML document, including comments and source formatting metadata.
   */
  document: Document

  /**
   * Number of spaces used to indent the source YAML file.
   */
  indent: number

  /**
   * Parsed pnpm workspace settings.
   */
  value: PnpmWorkspace
}

/**
 * Migratable settings selected from `package.json`.
 */
export interface ResolvedPackageJsonSettings {
  /**
   * Source settings left in place because the target cannot accept them.
   */
  issues: SettingsIssues

  /**
   * Original `package.json#pnpm` child keys selected for migration.
   */
  keys: string[]

  /**
   * Settings safe to merge into the target workspace manifest.
   */
  settings: PnpmWorkspace

  /**
   * Whether Yarn resolutions were selected for conversion to overrides.
   */
  yarnResolutions: boolean

  /**
   * Original Yarn selectors mapped to their supported pnpm override selectors.
   */
  yarnResolutionSelectors: Record<string, string>

  /**
   * Yarn selectors retained because they cannot be translated safely.
   */
  warnings: string[]
}

/**
 * Applied source settings and mutable manifest used for package cleanup.
 */
export interface CleanPackageJsonSettingsOptions {
  /**
   * Original `pnpm` child keys confirmed eligible for removal.
   */
  migratedKeys: string[]
  /**
   * Parsed package manifest whose legacy fields are removed in place.
   */
  packageJson: ParsedPackageJson
  /**
   * Original Yarn resolution keys whose translated values reached the destination.
   */
  migratedResolutionKeys: string[]
}

/**
 * Supported Yarn translations and warnings for selectors retained in the source.
 */
export interface ResolvedYarnResolutions {
  /**
   * Values keyed by pnpm-compatible selectors.
   */
  overrides: Record<string, string>
  /**
   * Original selector to destination selector mapping used for safe cleanup.
   */
  selectors: Record<string, string>
  /**
   * Unsupported or ambiguous selector diagnostics, without resolution values.
   */
  warnings: string[]
}

/**
 * Inputs used to apply semantic workspace changes to a YAML document.
 */
export interface UpdateYamlDocumentOptions {
  /**
   * Final settings to apply to changed root nodes.
   */
  after: PnpmWorkspace
  /**
   * Original settings used to identify changed and removed root nodes.
   */
  before: PnpmWorkspace
  /**
   * Whether to sort mapping keys recursively after applying changes.
   */
  sortKeys: boolean
}
