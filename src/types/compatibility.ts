import type { CompatibilityTarget } from './options'
import type { PackageManagerEngine } from './package-json'

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
   * Whether the selected runtime is represented in the destination manifest.
   */
  applied: boolean

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

/**
 * Parsed exact pnpm version used only for capability evaluation.
 */
export interface PnpmVersion {
  /**
   * Original declaration including prerelease or build metadata.
   */
  raw: string
  /**
   * Major component of the version.
   */
  major: number
  /**
   * Minor component of the version.
   */
  minor: number
  /**
   * Patch component of the version.
   */
  patch: number
  /**
   * Prerelease identifiers, whose capabilities are not assumed.
   */
  prerelease?: string
}

/**
 * Workspace and task fields introduced by a particular stable release.
 */
export interface PnpmSettingsCapability {
  /**
   * Earliest supported major, minor, and patch, in that order.
   */
  minimumVersion: readonly [number, number, number]
  /**
   * Top-level workspace fields enabled by this release.
   */
  workspaceFields: readonly string[]
  /**
   * Nested task fields enabled by this release.
   */
  taskFields: readonly string[]
}

/**
 * Resolved major and field capabilities for one migration.
 */
export interface ResolvedPnpmTarget {
  /**
   * Major schema used for normalization and source cleanup.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  /**
   * Confirmed exact version matching the selected major, when available.
   */
  version?: PnpmVersion
  /**
   * Workspace fields accepted by this target.
   */
  workspaceSettings: ReadonlySet<string>
  /**
   * Task fields accepted by this target.
   */
  taskSettings: ReadonlySet<string>
}

/**
 * Explicit target and project declarations used to resolve pnpm capabilities.
 */
export interface ResolvePnpmTargetOptions {
  /**
   * Requested major schema or automatic detection.
   */
  compatibility: CompatibilityTarget
  /**
   * Exact version overriding the project declarations.
   */
  targetVersion?: string
  /**
   * Primary package manager declaration from package.json.
   */
  packageManager?: string
  /**
   * Fallback package manager declarations from devEngines.
   */
  devPackageManager?: PackageManagerEngine | PackageManagerEngine[]
}
