import type { CompatibilityTarget } from './options'

/**
 * Result of normalizing pnpm settings for a compatibility target.
 */
export interface NormalizedSettingsResult {
  /**
   * Whether normalization mutated the provided settings.
   */
  changed: boolean

  /**
   * Removed Node.js runtime version that should move to `package.json`.
   */
  runtimeVersion?: string

  /**
   * User-facing compatibility warnings produced during normalization.
   */
  warnings: string[]
}

/**
 * Context required to normalize pnpm settings.
 */
export interface NormalizeSettingsOptions {
  /**
   * Concrete pnpm compatibility target.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>

  /**
   * Working directory used to resolve referenced files.
   */
  cwd: string

  /**
   * Whether deprecated settings should be replaced for pnpm v10.
   */
  replaceDeprecated: boolean
}

/**
 * Result of moving a runtime setting into the package manifest.
 */
export interface RuntimeMigrationResult {
  /**
   * Whether the package manifest was mutated.
   */
  changed: boolean

  /**
   * User-facing warning when the runtime setting could not be applied.
   */
  warning?: string
}

/**
 * URL-keyed registry options preserved while converting legacy named registries.
 */
export interface RegistryDeclaration {
  /**
   * Canonical alias prefix assigned to this registry URL.
   */
  prefix?: string
  /**
   * Package scopes routed to this URL, including `@` for the default registry.
   */
  scopes?: string[]
  /**
   * Additional registry options preserved during alias normalization.
   */
  [key: string]: unknown
}

/**
 * Legacy package-name lists converted into per-package `allowBuilds` permissions.
 */
export type LegacyBuildDependencyList =
  | 'ignoredBuiltDependencies'
  | 'neverBuiltDependencies'
  | 'onlyBuiltDependencies'
