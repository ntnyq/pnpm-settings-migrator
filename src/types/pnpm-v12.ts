import type { PnpmSettings, RegistryDeclaration } from '@pnpm/types'

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
export interface PnpmRegistryDeclaration extends RegistryDeclaration {
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
 * Settings supported by pnpm v12, subject to the resolved version capabilities.
 */
export interface PnpmSettingsV12 {
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
