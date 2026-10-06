import {
  PNPM_V12_6_WORKSPACE_SETTINGS,
  PNPM_V12_7_WORKSPACE_SETTINGS,
  PNPM_V12_10_WORKSPACE_SETTINGS,
} from './pnpm-capabilities'
import {
  PNPM_V11_WORKSPACE_SETTINGS_FIELDS,
  PNPM_V11_ONLY_WORKSPACE_SETTINGS,
} from './pnpm-v11'

/**
 * Settings introduced by pnpm v12.
 */
export const PNPM_V12_ONLY_WORKSPACE_SETTINGS: readonly string[] = [
  'autoInstallPeersFromHighestMatch',
  'externalDependencies',
  'globalShims',
]

/**
 * Lookup used to remove v11-only fields from the v12 workspace allowlist.
 */
const v11OnlyWorkspaceSettings = new Set(PNPM_V11_ONLY_WORKSPACE_SETTINGS)

/**
 * Fields accepted by registry declarations with pnpm 12.9 concurrency limits.
 */
export const PNPM_V12_REGISTRY_DECLARATION_FIELDS: readonly string[] = [
  'ecosystem',
  'networkConcurrency',
  'packages',
  'prefix',
  'scopes',
  'serverType',
  'supportsTimeField',
]

/**
 * Settings accepted by a pnpm v12 project workspace manifest.
 */
export const PNPM_V12_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
  ...PNPM_V11_WORKSPACE_SETTINGS_FIELDS.filter(
    field =>
      !v11OnlyWorkspaceSettings.has(field) &&
      !PNPM_V12_6_WORKSPACE_SETTINGS.includes(field) &&
      !PNPM_V12_7_WORKSPACE_SETTINGS.includes(field) &&
      !PNPM_V12_10_WORKSPACE_SETTINGS.includes(field),
  ),
  ...PNPM_V12_ONLY_WORKSPACE_SETTINGS,
]
