import type { PnpmSettingsCapability } from '../types'

/**
 * Workspace settings first consumed by pnpm v12 in 12.6.0.
 */
export const PNPM_V12_6_WORKSPACE_SETTINGS: readonly string[] = [
  'autoDedupe',
  'loglevel',
  'progress',
  'saveTypes',
  'tagVersionPrefix',
]

/**
 * Release introducing platform lists, registry ecosystems, and Python options.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_5_MINIMUM_VERSION = [12, 5, 0] as const

/**
 * Release introducing package routes in Python registry declarations.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_5_1_MINIMUM_VERSION = [12, 5, 1] as const

/**
 * Version-gated settings. Add a release entry only when supported fields change.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs
 */
export const PNPM_SETTINGS_CAPABILITIES: readonly PnpmSettingsCapability[] = [
  {
    // eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
    minimumVersion: [11, 27, 0],
    workspaceFields: ['trustPolicyExcludePrune'],
    taskFields: [],
  },
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
  {
    minimumVersion: PNPM_V12_5_MINIMUM_VERSION,
    workspaceFields: ['concurrencyGroups'],
    taskFields: ['concurrencyGroup'],
  },
  {
    // eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
    minimumVersion: [12, 6, 0],
    workspaceFields: PNPM_V12_6_WORKSPACE_SETTINGS,
    taskFields: ['priority'],
  },
]

/**
 * Known workspace fields that require a confirmed version.
 */
export const PNPM_VERSIONED_WORKSPACE_SETTINGS = new Set(
  PNPM_SETTINGS_CAPABILITIES.flatMap(capability => capability.workspaceFields),
)
