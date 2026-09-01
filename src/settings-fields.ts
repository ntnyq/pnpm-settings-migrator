import { PNPM_V10_NPMRC_SETTINGS_FIELDS } from './constants'

/**
 * Settings that a project-level `pnpm-workspace.yaml` must never control.
 *
 * @see https://github.com/pnpm/pnpm/blob/main/pnpm11/config/reader/src/index.ts
 * @see https://github.com/pnpm/pnpm/blob/v12.2.1/pnpm/crates/config/src/refused_keys.rs
 */
// @keep-sorted
// @keep-unique
export const PNPM_PROJECT_REFUSED_SETTINGS: readonly string[] = [
  'allProjects',
  'allProjectsGraph',
  'authConfig',
  'bin',
  'cliOptions',
  'configByUri',
  'configDir',
  'explicitlySetKeys',
  'finders',
  'globalBinDir',
  'globalDir',
  'globalPkgDir',
  'hooks',
  'npmrcAuthFile',
  'packageManager',
  'packageManagerNetworkConfig',
  'packageManagerRegistries',
  'pnpmHomeDir',
  'prodAllProjectsGraph',
  'prodOnlySelectedProjectDirs',
  'rootProjectManifest',
  'rootProjectManifestDir',
  'scope',
  'selectedProjectsGraph',
  'stateDir',
  'userConfig',
  'userconfig',
  'wantedPackageManager',
  'workspaceDir',
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
const PNPM_V11_ADDITIONAL_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
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

const refusedProjectSettings = new Set(PNPM_PROJECT_REFUSED_SETTINGS)

/**
 * Settings accepted by a pnpm v11 project workspace manifest.
 */
export const PNPM_V11_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
  ...new Set([
    ...PNPM_V10_NPMRC_SETTINGS_FIELDS,
    ...PNPM_V11_ADDITIONAL_WORKSPACE_SETTINGS_FIELDS,
  ]),
].filter(field => !refusedProjectSettings.has(field))

/**
 * Settings that are supported by v11 but not by pnpm v12.
 */
export const PNPM_V11_ONLY_WORKSPACE_SETTINGS: readonly string[] = [
  'confirmModulesPurge',
  'packageConfigs',
]

/**
 * Settings introduced by pnpm v12.
 */
export const PNPM_V12_ONLY_WORKSPACE_SETTINGS: readonly string[] = [
  'autoInstallPeersFromHighestMatch',
  'externalDependencies',
  'globalShims',
]

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
