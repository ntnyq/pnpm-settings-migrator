/**
 * Settings that a project-level `pnpm-workspace.yaml` must never control.
 *
 * @see https://github.com/pnpm/pnpm/blob/main/pnpm11/config/reader/src/index.ts
 * @see https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/refused_keys.rs
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
  'globalPackagesConfig',
  'globalPkgDir',
  'hooks',
  'macosBackup',
  'npmrcAuthFile',
  'packageManager',
  'packageManagerNetworkConfig',
  'packageManagerRegistries',
  'pnpmHomeDir',
  'prodAllProjectsGraph',
  'prodOnlySelectedProjectDirs',
  'rawLockfileDir',
  'rootProjectManifest',
  'rootProjectManifestDir',
  'scope',
  'selectedProjectsGraph',
  'stateDir',
  'symlinkedLockfileTargetDirs',
  'tools',
  'userConfig',
  'userconfig',
  'wantedPackageManager',
  'workspaceDir',
]
