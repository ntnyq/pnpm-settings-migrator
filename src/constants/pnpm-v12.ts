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
 * Settings accepted by a pnpm v12 project workspace manifest.
 */
export const PNPM_V12_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
  ...PNPM_V11_WORKSPACE_SETTINGS_FIELDS.filter(
    field => !v11OnlyWorkspaceSettings.has(field),
  ),
  ...PNPM_V12_ONLY_WORKSPACE_SETTINGS,
]
