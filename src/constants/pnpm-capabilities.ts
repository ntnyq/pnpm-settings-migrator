import type { PnpmSettingsCapability } from '../types'

/**
 * Version-gated settings. Add a release entry only when supported fields change.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs
 */
export const PNPM_SETTINGS_CAPABILITIES: readonly PnpmSettingsCapability[] = [
  {
    // eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
    minimumVersion: [12, 4, 0],
    workspaceFields: [
      'cargo',
      'packageConfigs',
      'pipelineBase',
      'pipelines',
      'python',
      'trustPolicyExcludePrune',
    ],
    taskFields: ['cache', 'cargoTargetDir', 'env', 'inputs', 'outputs'],
  },
]

/**
 * Known workspace fields that require a confirmed version.
 */
export const PNPM_VERSIONED_WORKSPACE_SETTINGS = new Set(
  PNPM_SETTINGS_CAPABILITIES.flatMap(capability => capability.workspaceFields),
)

/**
 * Known task fields that require a confirmed version.
 */
export const PNPM_VERSIONED_TASK_SETTINGS = new Set(
  PNPM_SETTINGS_CAPABILITIES.flatMap(capability => capability.taskFields),
)
