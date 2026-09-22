/**
 * Authentication and registry keys that must remain in `.npmrc`.
 */
export const NPMRC_AUTH_OR_REGISTRY_KEYS: string[] = [
  '_auth',
  '_authtoken',
  '_password',
  'always-auth',
  'ca',
  'cafile',
  'cert',
  'certfile',
  'email',
  'key',
  'keyfile',
  'otp',
  'tokenhelper',
  'username',
]

/**
 * Pattern for pnpm's channel-specific Node.js mirror keys.
 */
export const NODE_MIRROR_KEY_PATTERN = /^node-mirror:(?<channel>.+)$/iu

/**
 * List settings accepting a single string in legacy `.npmrc` files.
 * Workspace YAML requires these values to be arrays.
 * Legacy build permission lists keep their explicit array validation.
 */
export const NPMRC_STRING_ARRAY_SETTINGS: readonly string[] = [
  'changedFilesIgnorePattern',
  'externalDependencies',
  'extraBinPaths',
  'filter',
  'filterProd',
  'gitShallowHosts',
  'hoistPattern',
  'ignoredOptionalDependencies',
  'mergeGitBranchLockfilesBranchPattern',
  'minimumReleaseAgeExclude',
  'packages',
  'publicHoistPattern',
  'requiredScripts',
  'syncInjectedDepsAfterScripts',
  'testPattern',
  'trustPolicyExclude',
  'workspacePackagePatterns',
]
