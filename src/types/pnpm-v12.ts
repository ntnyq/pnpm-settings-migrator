import type {
  PnpmSettings,
  RegistryDeclaration,
  SideEffectsCacheSettings,
} from '@pnpm/types'

/**
 * Policy used by pnpm v12's project-aware global shims.
 */
export type GlobalShimPolicy = boolean | 'always' | 'auto' | 'prompt'

/**
 * Task configuration with caching, concurrency groups, and pnpm 12.6 priority.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_yaml/sections.rs
 */
export interface PnpmTaskSettings {
  /**
   * Maximum concurrent executions of this task.
   */
  concurrency?: number
  /**
   * Machine-wide concurrency group to count this task against (pnpm 12.5+).
   */
  concurrencyGroup?: string
  /**
   * Signed 32-bit priority within a concurrency group; higher runs first
   * (pnpm 12.6+). Omitted means zero.
   */
  priority?: number
  /**
   * Prerequisite tasks; a caret prefix refers to workspace dependencies.
   */
  dependsOn?: string[]
  /**
   * Project-relative output globs; declaring this field enables caching.
   */
  outputs?: string[]
  /**
   * Input globs used for the cache key; a plus prefix adds to default inputs.
   */
  inputs?: string[]
  /**
   * Environment variable names whose values participate in the cache key.
   */
  env?: string[]
  /**
   * Set to false to disable caching despite declared outputs.
   */
  cache?: boolean
  /**
   * Project-relative Cargo target directory used for local state snapshots.
   */
  cargoTargetDir?: string
}

/**
 * Python dependency management configuration introduced in pnpm 12.4.0.
 */
export interface PnpmPythonSettings {
  /**
   * Enable Python dependency management.
   */
  enabled?: boolean
  /**
   * Python interpreter executable.
   */
  executable?: string
  /**
   * Python package index URL accepted by pnpm 12.4.
   * @deprecated pnpm 12.5+ uses a registries entry with ecosystem: pypi.
   */
  indexUrl?: string
  /**
   * Optional Python dependency extras to install.
   */
  extras?: string[]
  /**
   * Python dependency groups to install.
   */
  groups?: string[]
  /**
   * Python versions to resolve the lockfile for (pnpm 12.5+).
   */
  versions?: string[]
  /**
   * Python requirements that override dependency versions (pnpm 12.5+).
   */
  overrides?: string[]
  /**
   * Additional constraints on Python dependency versions (pnpm 12.5+).
   */
  constraints?: string[]
}

/**
 * Cargo dependency management configuration introduced in pnpm 12.4.0.
 */
export interface PnpmCargoSettings {
  /**
   * Enable Cargo dependency management.
   */
  enabled?: boolean
  /**
   * Cargo registry index URL accepted by pnpm 12.4.
   * @deprecated pnpm 12.5+ uses a registries entry with ecosystem: cargo.
   */
  indexUrl?: string
}

/**
 * URL-keyed registry declaration with pnpm 12.5 ecosystem support.
 */
export interface PnpmRegistryDeclaration extends Omit<
  RegistryDeclaration,
  'serverType'
> {
  /**
   * Registry protocol; pnpr requires pnpm 11.28.9+ or 12.15+.
   */
  serverType?: 'npm' | 'artifactory' | 'pnpr' | null
  /**
   * Positive integer limiting requests to this registry's origin within the
   * global networkConcurrency limit (pnpm 12.9+). Null leaves it unset.
   */
  networkConcurrency?: number | null
  /**
   * Package ecosystem served by the registry; omitted means npm (pnpm 12.5+).
   */
  ecosystem?: 'cargo' | 'npm' | 'pypi'
  /**
   * Python package names or trailing-prefix patterns; * selects the default
   * index (pnpm 12.5.1+).
   */
  packages?: string[]
}

/**
 * Loaded linker options introduced in pnpm 12.10.0.
 */
export interface PnpmLoadedNodeLinkerSettings {
  /**
   * Load dependencies through pnpm's loader instead of materializing a full tree.
   */
  type: 'loaded'
  /**
   * Packages whose complete dependency trees use the global virtual store.
   */
  excluded?: string[]
}

/**
 * Lockfile object options introduced in pnpm 12.10.0.
 */
export interface PnpmLockfileSettings {
  /**
   * Include resolution-affecting configuration in the lockfile. Null uses pnpm's
   * default; an empty options object also enables the lockfile.
   */
  includeResolutionSettings?: boolean | null
  /**
   * Hash the downloaded resource or its uncompressed tar (pnpm 12.15+).
   * Null leaves pnpm's default effective.
   */
  integrityTarget?: 'resource' | 'tar' | null
}

/**
 * Dependency capabilities introduced in pnpm 12.11.0. Strings are undecided
 * prompts; null leaves a capability unset.
 */
export interface PnpmPackagePermissions {
  /**
   * Lifecycle script decision, taking precedence over the matching allowBuilds
   * entry when boolean. An undecided string leaves that entry effective.
   */
  build?: boolean | string | null
  /**
   * Whether pnpm may link the agent skills shipped by the dependency.
   */
  skills?: boolean | string | null
}

/**
 * Agent skill linking configuration introduced in pnpm 12.11.0.
 */
export interface PnpmSkillsSettings {
  /**
   * Workspace-relative agent skill directories, replacing detected directories.
   * An empty list disables linking; null leaves directory detection enabled.
   */
  dirs?: string[] | null
}

/**
 * Settings supported by pnpm v12, subject to the resolved version capabilities.
 */
export interface PnpmSettingsV12 {
  /**
   * Verify registry TLS certificates (consumed by v12 from 12.16).
   * Null leaves the upstream default effective.
   */
  strictSsl?: boolean | null
  /**
   * Source IP for registry connections (consumed by v12 from 12.16).
   * Invalid addresses are treated as unset by pnpm.
   */
  localAddress?: string | null
  /**
   * Install declared runtimes unless false (consumed by v12 from 12.16).
   */
  runtime?: boolean | null
  /**
   * Scripts every selected workspace project must define (v12.16+).
   */
  requiredScripts?: string[] | null
  /**
   * Default distribution tag used when adding packages (v12.16+).
   */
  tag?: string | null
  /**
   * Settings delegated to local YAML files or config dependencies (12.15+).
   * Wildcards are allowed only for local files.
   */
  include?: PnpmIncludeSettings
  /**
   * Policy for installing config dependencies and the pinned pnpm (12.15+).
   */
  bootConfig?: PnpmBootConfigSettings | null
  /**
   * Maximum unpacked bytes per tarball (11.28.7+ or 12.15+).
   * Null leaves the upstream default effective.
   */
  maxTarballUnpackedSize?: number | null
  /**
   * Package-map generation and loading options (pnpm 12.13+).
   */
  nodePackageMap?: PnpmNodePackageMapSettings | null
  /**
   * Store package index backend; files supports network shares (pnpm 12.13+).
   */
  storeIndexFormat?: 'sqlite' | 'files' | null
  /**
   * Build cache policy, including exclusions from pnpm 12.14 onward.
   */
  sideEffectsCache?: boolean | PnpmSideEffectsCacheSettings
  /**
   * Link available companion @types packages as optional peers (pnpm 12.12+).
   * Null leaves pnpm's default unchanged.
   */
  addMissingPeerTypes?: boolean | null
  /**
   * Project-owned remote cache configuration (pnpm 12.12+).
   */
  remoteCache?: PnpmRemoteCacheSettings | null
  /**
   * Per-dependency build and agent skill permissions (pnpm 12.11+).
   */
  permissions?: Record<string, PnpmPackagePermissions | null> | null
  /**
   * Agent skill linking options (pnpm 12.11+).
   */
  skills?: PnpmSkillsSettings | null
  /**
   * Dependency linking mode. Loaded linking and its options require pnpm 12.10+.
   */
  nodeLinker?:
    | 'isolated'
    | 'hoisted'
    | 'pnp'
    | 'loaded'
    | PnpmLoadedNodeLinkerSettings
  /**
   * Enable the lockfile, optionally configuring what it records (pnpm 12.10+).
   */
  lockfile?: boolean | PnpmLockfileSettings
  /**
   * Milliseconds to wait for published artifacts; zero disables waiting (12.7+).
   */
  publishWaitTimeout?: number
  /**
   * Default terminal reporter (consumed by pnpm v12 from 12.7).
   */
  reporter?: 'default' | 'append-only' | 'ndjson' | 'silent'
  /**
   * Deduplicate compatible dependency versions during installation (pnpm 12.6+).
   */
  autoDedupe?: boolean
  /**
   * Save available companion @types packages as dev dependencies (pnpm 12.6+).
   */
  saveTypes?: boolean
  /**
   * Show dependency and download progress (consumed by pnpm v12 from 12.6).
   */
  progress?: boolean
  /**
   * Minimum logging level (consumed by pnpm v12 from 12.6).
   */
  loglevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'
  /**
   * Prefix for version tags; an empty string removes it (pnpm v12.6+).
   */
  tagVersionPrefix?: string
  /**
   * Machine-wide limits shared by tasks in each group (pnpm 12.5+).
   */
  concurrencyGroups?: Record<string, number>
  /**
   * Legacy OS/CPU/libc axes, or platform names and Rust triples (pnpm 12.5+).
   */
  supportedArchitectures?: PnpmSettings['supportedArchitectures'] | string[]
  /**
   * Legacy scope routes or URL-keyed declarations with ecosystem settings.
   */
  registries?: Record<string, PnpmRegistryDeclaration | string>
  /**
   * Peer auto-installation policy (v12 or confirmed v11 from 11.28.7).
   */
  autoInstallPeersFromHighestMatch?: boolean | null
  /**
   * External dependency names (v12 or confirmed v11 from 11.28.7).
   */
  externalDependencies?: string[] | null
  /**
   * Project-aware global shim policies, or `false` to disable global shims.
   * Project configuration is accepted only before pnpm 12.8.2.
   */
  globalShims?: false | Record<string, GlobalShimPolicy>

  /**
   * Remove unused trust policy exclusions during dependency changes.
   */
  trustPolicyExcludePrune?: boolean
  /**
   * Python dependency management options.
   */
  python?: PnpmPythonSettings
  /**
   * Cargo dependency management options.
   */
  cargo?: PnpmCargoSettings
  /**
   * Named pipelines containing task requests.
   */
  pipelines?: Record<string, string[]>
  /**
   * Base reference used by pipeline execution.
   */
  pipelineBase?: string
  /**
   * Named task execution and cache settings.
   */
  tasks?: Record<string, PnpmTaskSettings>
}

/**
 * Package-map section introduced in pnpm 12.13. Explicit fields take precedence
 * over nodeExperimentalPackageMap and nodePackageMapType in the same source.
 */
export interface PnpmNodePackageMapSettings {
  /**
   * Disable the map, write it for tools, or also load it in Node.js scripts.
   * Null leaves the legacy setting or pnpm's default effective.
   */
  mode?: 'off' | 'write-only' | 'load' | null
  /**
   * Map format; null leaves the legacy setting or default effective.
   */
  type?: 'standard' | 'loose' | null
}

/**
 * Structured build cache options with pnpm 12.14 package exclusions.
 */
export interface PnpmSideEffectsCacheSettings extends SideEffectsCacheSettings {
  /**
   * Package name, scope, or name@version patterns whose builds are neither
   * restored nor saved; null leaves exclusions unset.
   */
  exclude?: string[] | null
}

/**
 * Remote cache options allowed in project YAML. Server and signing settings
 * belong in trusted global configuration or environment variables.
 */
export interface PnpmRemoteCacheSettings {
  /**
   * Organization owning shared artifacts; null leaves it unset.
   */
  org?: string | null
}

/**
 * Bootstrap policy introduced in pnpm 12.15. Null fields fall through to the
 * normal settings; config dependency policy never governs its own installation.
 */
export interface PnpmBootConfigSettings {
  /**
   * Minimum package age in minutes during bootstrap.
   */
  minimumReleaseAge?: number | null
  /**
   * Package patterns exempt from the bootstrap release-age policy.
   */
  minimumReleaseAgeExclude?: string[] | null
  /**
   * Require every selected version to satisfy the bootstrap release age.
   */
  minimumReleaseAgeStrict?: boolean | null
  /**
   * Permit missing publication times during bootstrap.
   */
  minimumReleaseAgeIgnoreMissingTime?: boolean | null
  /**
   * Trust evidence policy applied during bootstrap.
   */
  trustPolicy?: 'off' | 'no-downgrade' | null
  /**
   * Package patterns exempt from the bootstrap trust policy.
   */
  trustPolicyExclude?: string[] | null
  /**
   * Minutes after publication when bootstrap trust checks stop applying.
   */
  trustPolicyIgnoreAfter?: number | null
}

/**
 * Settings owned by each local YAML file or declared config dependency.
 * Lists reserve the named settings even when the source omits their values.
 */
export type PnpmIncludeSettings = Record<string, '*' | string[]>
