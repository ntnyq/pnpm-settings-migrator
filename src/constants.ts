export const NPMRC = '.npmrc'
export const PACKAGE_JSON = 'package.json'
export const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'

/**
 * Default indent: 2 spaces
 */
export const DEFAULT_INDENT = 2

/**
 * @see {@link https://pnpm.io/settings}
 */
// @keep-sorted
export const PNPM_SETTINGS_FIELDS: string[] = [
  'allowedDeprecatedVersions',
  'allowNonAppliedPatches',
  'auditConfig',
  'configDependencies',
  'dangerouslyAllowAllBuilds',
  'executionEnv',
  'ignoredBuiltDependencies',
  'ignoredOptionalDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'overrides',
  'packageExtensions',
  'patchedDependencies',
  'peerDependencyRules',
  'requiredScripts',
  'supportedArchitectures',
  'updateConfig',
]
