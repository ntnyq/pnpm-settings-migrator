export const NPMRC = '.npmrc'
export const PACKAGE_JSON = 'package.json'
export const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'

/**
 * Default indent: 2 spaces
 */
export const DEFAULT_INDENT = 2

/**
 * @see {@link https://github.com/pnpm/pnpm/blob/main/packages/types/src/package.ts}
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
  'executionEnv',
  'httpProxy',
  'httpsProxy',
  'ignoredBuiltDependencies',
  'ignoredOptionalDependencies',
  'ignorePatchFailures',
  'neverBuiltDependencies',
  'nodeDownloadMirrors',
  'noProxy',
  'npmrcAuthFile',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'overrides',
  'packageExtensions',
  'patchedDependencies',
  'peerDependencyRules',
  'registries',
  'requiredScripts',
  'supportedArchitectures',
  'updateConfig',
]
