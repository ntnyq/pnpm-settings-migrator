/**
 * Policy used by pnpm v12's project-aware global shims.
 */
export type GlobalShimPolicy = boolean | 'always' | 'auto' | 'prompt'

/**
 * Pipeline task configuration supported by pnpm 12.4.0.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs
 */
export interface PnpmTaskSettings {
  /**
   * Maximum concurrent executions of this task.
   */
  concurrency?: number
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
   * Python package index URL.
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
   * Cargo registry index URL.
   */
  indexUrl?: string
}

/**
 * Settings supported by pnpm v12, subject to the resolved version capabilities.
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
