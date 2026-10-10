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
 * Release introducing forceIgnoresPlatform and filtering dynamic user agents.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V11_28_MINIMUM_VERSION = [11, 28, 0] as const

/**
 * Release validating patch path maps before reading them.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V11_28_1_MINIMUM_VERSION = [11, 28, 1] as const

/**
 * Release validating allowBuilds maps before reading them.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V11_28_3_MINIMUM_VERSION = [11, 28, 3] as const

/**
 * Release validating workspace booleans and string arrays.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V11_28_4_MINIMUM_VERSION = [11, 28, 4] as const

/**
 * Release validating proxy URL protocols.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V11_28_5_MINIMUM_VERSION = [11, 28, 5] as const

/**
 * Release adding force, publishing, and reporter settings.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_7_MINIMUM_VERSION = [12, 7, 0] as const

/**
 * Release restricting global shims to trusted configuration.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_8_2_MINIMUM_VERSION = [12, 8, 2] as const

/**
 * Release introducing per-registry network concurrency limits.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_9_MINIMUM_VERSION = [12, 9, 0] as const

/**
 * Release introducing loaded linking and lockfile resolution settings.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_10_MINIMUM_VERSION = [12, 10, 0] as const

/**
 * Release introducing package permissions, agent skills, and workspace provenance.
 */
// eslint-disable-next-line no-magic-numbers -- Exact release components are capability data.
export const PNPM_V12_11_MINIMUM_VERSION = [12, 11, 0] as const

/**
 * Workspace settings first consumed by pnpm v12 in 12.11.0.
 */
export const PNPM_V12_11_WORKSPACE_SETTINGS: readonly string[] = [
  'permissions',
  'skills',
  'provenance',
]

/**
 * Workspace settings first consumed by pnpm v12 in 12.10.0.
 */
export const PNPM_V12_10_WORKSPACE_SETTINGS: readonly string[] = [
  'failIfNoMatch',
]

/**
 * Workspace settings first consumed by pnpm v12 in 12.7.0.
 */
export const PNPM_V12_7_WORKSPACE_SETTINGS: readonly string[] = [
  'forceIgnoresPlatform',
  'publishWaitTimeout',
  'reporter',
]

/**
 * Version-gated settings. Add a release entry only when supported fields change.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs
 */
export const PNPM_SETTINGS_CAPABILITIES: readonly PnpmSettingsCapability[] = [
  {
    minimumVersion: PNPM_V12_11_MINIMUM_VERSION,
    workspaceFields: PNPM_V12_11_WORKSPACE_SETTINGS,
    taskFields: [],
  },
  {
    minimumVersion: PNPM_V11_28_MINIMUM_VERSION,
    workspaceFields: ['forceIgnoresPlatform'],
    taskFields: [],
  },
  {
    minimumVersion: PNPM_V12_7_MINIMUM_VERSION,
    workspaceFields: PNPM_V12_7_WORKSPACE_SETTINGS,
    taskFields: [],
  },
  {
    minimumVersion: PNPM_V12_10_MINIMUM_VERSION,
    workspaceFields: PNPM_V12_10_WORKSPACE_SETTINGS,
    taskFields: [],
  },
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
