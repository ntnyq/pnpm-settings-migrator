import { unique } from '@ntnyq/utils'
import { PNPM_V10_NPMRC_SETTINGS_FIELDS } from './pnpm-v10'
import { PNPM_PROJECT_REFUSED_SETTINGS } from './settings-fields'

/**
 * Legacy settings removed during normalization for pnpm v11 and newer.
 */
export const PNPM_V11_REMOVED_SETTINGS: readonly string[] = [
  'allowNonAppliedPatches',
  'executionEnv',
  'ignoreDepScripts',
  'ignorePatchFailures',
  'ignoredBuiltDependencies',
  'managePackageManagerVersions',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'packageManagerStrict',
  'packageManagerStrictVersion',
  'useNodeVersion',
]

/**
 * Settings added to, or recognized by, pnpm's v11 workspace config schema.
 * Combined with the v10 settings below to form the complete v11 allowlist.
 *
 * @see https://github.com/pnpm/pnpm/blob/main/pnpm11/config/reader/src/types.ts
 * @see https://github.com/pnpm/pnpm/blob/main/pnpm11/config/reader/src/unknownSettings.ts
 */
// @keep-sorted
// @keep-unique
export const PNPM_V11_ADDITIONAL_WORKSPACE_SETTINGS_FIELDS: readonly string[] =
  [
    'access',
    'aggregateOutput',
    'allowNew',
    'allowSameVersion',
    'audit',
    'auditIgnorePrune',
    'autoConfirmAllPrompts',
    'bail',
    'binLinks',
    'catalog',
    'catalogPrune',
    'catalogs',
    'changedFilesIgnorePattern',
    'commitHooks',
    'confirmModulesPurge',
    'cpu',
    'dedupePeers',
    'depth',
    'description',
    'dev',
    'dryRun',
    'embedReadme',
    'enablePnp',
    'excludeLinksFromLockfile',
    'extraBinPaths',
    'extraEnv',
    'fetchingConcurrency',
    'filter',
    'filterProd',
    'force',
    'frozenStore',
    'git',
    'gitTagVersion',
    'global',
    'globalPath',
    'globalPrefix',
    'hoistingLimits',
    'ignoreCurrentSpecifiers',
    'ignoreWorkspace',
    'initAuthorEmail',
    'initAuthorName',
    'initAuthorUrl',
    'initLicense',
    'initPackageManager',
    'initType',
    'initVersion',
    'json',
    'legacyDirFiltering',
    'libc',
    'lockfileOnly',
    'long',
    'maxSockets',
    'message',
    'minimumReleaseAgeExcludePrune',
    'minimumReleaseAgeIgnoreMissingTime',
    'minimumReleaseAgeStrict',
    'namedRegistries',
    'nodeDownloadMirrors',
    'nodeExperimentalPackageMap',
    'nodePackageMapType',
    'offline',
    'only',
    'os',
    'packDestination',
    'packGzipLevel',
    'packageConfigs',
    'packageLock',
    'packages',
    'parseable',
    'patchesDir',
    'pending',
    'pmOnFail',
    'pnpmExecPath',
    'pnprServer',
    'preferOffline',
    'preserveAbsolutePaths',
    'progress',
    'provenance',
    'publishBranch',
    'recursive',
    'registries',
    'registriesByPrefix',
    'registriesByScope',
    'registry',
    'registryOptionsByUrl',
    'remoteSideEffectsCache',
    'reporter',
    'reporterHidePrefix',
    'reverse',
    'runtime',
    'runtimeOnFail',
    'save',
    'saveCatalogName',
    'saveDev',
    'saveOptional',
    'savePeer',
    'saveProd',
    'scriptsPrependNodePath',
    'sideEffectsCacheRead',
    'sideEffectsCacheWrite',
    'signGitTag',
    'skipManifestObfuscation',
    'sort',
    'stream',
    'tasks',
    'testPattern',
    'trustLockfile',
    'tryLoadDefaultPnpmfile',
    'umask',
    'update',
    'useGitBranchLockfile',
    'useLockfile',
    'userAgent',
    'version',
    'versioning',
    'virtualStoreOnly',
    'virtualStoreType',
    'workspacePackagePatterns',
    'workspacePackages',
    'workspacePrefix',
    'workspaceRoot',
    'yes',
  ]

/**
 * Lookup used to exclude machine and invocation settings from workspace fields.
 */
const refusedProjectSettings = new Set(PNPM_PROJECT_REFUSED_SETTINGS)

/**
 * Settings accepted by a pnpm v11 project workspace manifest.
 */
export const PNPM_V11_WORKSPACE_SETTINGS_FIELDS: readonly string[] = unique([
  ...PNPM_V10_NPMRC_SETTINGS_FIELDS,
  ...PNPM_V11_ADDITIONAL_WORKSPACE_SETTINGS_FIELDS,
]).filter(field => !refusedProjectSettings.has(field))

/**
 * Settings that are supported by v11 but not by pnpm v12.
 */
export const PNPM_V11_ONLY_WORKSPACE_SETTINGS: readonly string[] = [
  'confirmModulesPurge',
  'packageConfigs',
]

/**
 * Fields pnpm v11 accepts inside a `packageConfigs` entry.
 */
export const PNPM_V11_PACKAGE_CONFIG_FIELDS: readonly string[] = [
  'hoist',
  'modulesDir',
  'overrides',
  'saveExact',
  'savePrefix',
]
