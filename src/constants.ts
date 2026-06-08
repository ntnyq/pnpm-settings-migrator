export const NPMRC = '.npmrc'
export const PACKAGE_JSON = 'package.json'
export const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'

/**
 * Default indent: 2 spaces
 */
export const DEFAULT_INDENT = 2

/**
 * @see {@link https://github.com/pnpm/pnpm/blob/main/packages/types/src/package.ts}
 * Schema-aligned pnpm config fields that can be migrated from `.npmrc`.
 *
 * Intentionally excluded workspace manifest-only fields:
 * - `catalog`
 * - `catalogMode`
 * - `catalogs`
 * - `cleanupUnusedCatalogs`
 * - `packages`
 */
// @keep-sorted
// @keep-unique
export const PNPM_SETTINGS_FIELDS: string[] = [
  'allowBuilds',
  'allowedDeprecatedVersions',
  'allowNonAppliedPatches',
  'allowUnusedPatches',
  'auditConfig',
  'configDependencies',
  'dedupeDirectDeps',
  'dedupeInjectedDeps',
  'dedupePeerDependents',
  'deployAllFiles',
  'engineStrict',
  'executionEnv',
  'fetchMinSpeedKiBps',
  'fetchRetryFactor',
  'fetchRetryMaxtimeout',
  'fetchRetryMintimeout',
  'fetchRetryTimeout',
  'fetchWarnTimeoutMs',
  'forceLegacyDeploy',
  'gitChecks',
  'gitShallowHosts',
  'globalVirtualStore',
  'globalVirtualStoreDir',
  'hoist',
  'hoistPattern',
  'hoistWorkspacePackages',
  'httpProxy',
  'httpsProxy',
  'ignoredBuiltDependencies',
  'ignoreDeps',
  'ignoredOptionalDependencies',
  'ignorePatchFailures',
  'ignoreWorkspaceCycles',
  'injectWorkspacePackages',
  'linkWorkspacePackages',
  'lockfile',
  'lockfileDir',
  'managePackageManagerVersions',
  'mergeGitBranchLockfiles',
  'mergeGitBranchLockfilesBranchPattern',
  'modulesCacheMaxAge',
  'networkConcurrency',
  'neverBuiltDependencies',
  'nodeDownloadMirrors',
  'nodeLinker',
  'noproxy',
  'noProxy',
  'npmPath',
  'npmrcAuthFile',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'optimisticRepeatInstall',
  'optional',
  'overrides',
  'packageExtensions',
  'packageImportMethod',
  'patchedDependencies',
  'peerDependencyRules',
  'peersSuffixMaxLength',
  'pnpmfile',
  'pnpmfileIgnorePkgManifest',
  'preferFrozenLockfile',
  'preferWorkspacePackages',
  'production',
  'proxy',
  'publicHoistPattern',
  'recursiveInstall',
  'registries',
  'requiredScripts',
  'resolutionMode',
  'resolvePeersFromWorkspaceRoot',
  'saveExact',
  'savePrefix',
  'scriptShell',
  'shamefullyHoist',
  'sharedWorkspaceLockfile',
  'shellEmulator',
  'sideEffectsCache',
  'sideEffectsCacheReadonly',
  'storeDir',
  'strictDepBuilds',
  'strictPeerDependencies',
  'strictSsl',
  'supportedArchitectures',
  'syncInjectedDepsAfterScripts',
  'tag',
  'targetDependenciesField',
  'timeout',
  'updateConfig',
  'useBetaCli',
  'useNodeVersion',
  'verifyDepsBeforeRun',
  'verifyStoreIntegrity',
  'virtualStoreDir',
  'virtualStoreDirMaxLength',
  'workspaceConcurrency',
]

// Removed in pnpm v11
export const PNPM_V11_REMOVED_SETTINGS: string[] = [
  'allowNonAppliedPatches',
  'ignorePatchFailures',
  'ignoredBuiltDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
]
