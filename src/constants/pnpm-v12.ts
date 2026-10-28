import {
  PNPM_V12_6_WORKSPACE_SETTINGS,
  PNPM_V12_7_WORKSPACE_SETTINGS,
  PNPM_V12_10_WORKSPACE_SETTINGS,
  PNPM_V12_11_WORKSPACE_SETTINGS,
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
 * Legacy fields absent from pnpm v12's base workspace reader.
 * Version capabilities restore fields consumed by later releases.
 * Removed aliases with explicit migration replacements are kept separately.
 *
 * @see https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/settings.rs
 */
export const PNPM_V12_IGNORED_WORKSPACE_SETTINGS: readonly string[] = [
  'access',
  'allowNew',
  'allowSameVersion',
  'auditIgnorePrune',
  'autoConfirmAllPrompts',
  'binLinks',
  'ci',
  'commitHooks',
  'cpu',
  'depth',
  'description',
  'dev',
  'dryRun',
  'enablePnp',
  'extraBinPaths',
  'extraEnv',
  'fetchingConcurrency',
  'force',
  'git',
  'gitTagVersion',
  'global',
  'globalPath',
  'globalPrefix',
  'ignoreCurrentSpecifiers',
  'json',
  'libc',
  'localAddress',
  'lockfileOnly',
  'long',
  'message',
  'npmPath',
  'only',
  'os',
  'packDestination',
  'packGzipLevel',
  'parseable',
  'pnpmExecPath',
  'preserveAbsolutePaths',
  'production',
  'publishBranch',
  'recursive',
  'registriesByPrefix',
  'registriesByScope',
  'registryOptionsByUrl',
  'requiredScripts',
  'runtime',
  'save',
  'saveDev',
  'saveOptional',
  'saveProd',
  'sideEffectsCacheRead',
  'sideEffectsCacheWrite',
  'signGitTag',
  'strictSsl',
  'tag',
  'tryLoadDefaultPnpmfile',
  'umask',
  'useGitBranchLockfile',
  'useLockfile',
  'useRunningStoreServer',
  'version',
  'workspacePackagePatterns',
  'workspacePackages',
  'workspacePrefix',
  'workspaceRoot',
  'yes',
]

/**
 * Lookup used to remove v11-only fields from the v12 workspace allowlist.
 */
const v11OnlyWorkspaceSettings = new Set([
  ...PNPM_V11_ONLY_WORKSPACE_SETTINGS,
  ...PNPM_V12_IGNORED_WORKSPACE_SETTINGS,
])

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
      !PNPM_V12_10_WORKSPACE_SETTINGS.includes(field) &&
      !PNPM_V12_11_WORKSPACE_SETTINGS.includes(field),
  ),
  ...PNPM_V12_ONLY_WORKSPACE_SETTINGS,
]
