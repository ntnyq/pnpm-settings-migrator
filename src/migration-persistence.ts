import camelcaseKeys from 'camelcase-keys'
import type {
  CompatibilityTarget,
  MigrationResult,
  PnpmWorkspace,
} from './types'
import { fsWriteFileIfChanged, pruneNpmrc } from './utils'
import {
  cleanPackageJsonSettings,
  type ParsedPackageJson,
  type ResolvedPackageJsonSettings,
} from './utils/config'
import type { MigratableNpmrc } from './utils/npmrc'
import type { ProjectNpmrcMigrations } from './utils/project-npmrc'

const SETTINGS_WITHOUT_REPLACEMENT = new Set([
  'ignoreDepScripts',
  'ignorePatchFailures',
])
const REPLACEMENT_SETTING_KEYS: Readonly<Record<string, string>> = {
  allowNonAppliedPatches: 'allowUnusedPatches',
  auditConfig: 'audit',
  auditLevel: 'audit',
  cleanupUnusedCatalogs: 'catalogPrune',
  enableGlobalVirtualStore: 'virtualStoreType',
  ignoredBuiltDependencies: 'allowBuilds',
  managePackageManagerVersions: 'pmOnFail',
  namedRegistries: 'registries',
  neverBuiltDependencies: 'allowBuilds',
  onlyBuiltDependencies: 'allowBuilds',
  onlyBuiltDependenciesFile: 'allowBuilds',
  packageManagerStrict: 'pmOnFail',
  packageManagerStrictVersion: 'pmOnFail',
  remoteSideEffectsCache: 'sideEffectsCache',
  sideEffectsCacheReadonly: 'sideEffectsCache',
  updateConfig: 'update',
}

/**
 * Files and cleanup policy needed to persist one migration.
 */
export interface PersistMigrationOptions {
  cleanNpmrc: boolean
  cleanPackageJson: boolean
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  finalSettings: PnpmWorkspace
  incomingSettings: PnpmWorkspace
  npmrc: MigratableNpmrc
  npmrcExists: boolean
  npmrcPath: string
  packageJson: ParsedPackageJson
  packageJsonExists: boolean
  packageJsonPath: string
  packageJsonRuntimeChanged: boolean
  packageJsonSettings: ResolvedPackageJsonSettings
  pnpmWorkspaceContent: string
  pnpmWorkspacePath: string
  projectNpmrcs: ProjectNpmrcMigrations
  runtimeVersion?: string
}

function containsMigratedValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return expected.every(expectedItem =>
      actual.some(actualItem =>
        containsMigratedValue(actualItem, expectedItem),
      ),
    )
  }

  if (
    actual &&
    expected &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    return Object.entries(expected).every(([key, expectedValue]) =>
      containsMigratedValue(
        (actual as Record<string, unknown>)[key],
        expectedValue,
      ),
    )
  }

  return Object.is(actual, expected)
}

interface SelectAppliedRootKeysOptions {
  finalSettings: PnpmWorkspace
  incomingSettings: PnpmWorkspace
  keys: string[]
  npmrc?: boolean
  runtimeApplied: boolean
  runtimeVersion?: string
  sourceSettings: object
}

function resolveSourceRuntimeVersion(
  sourceSettings: object,
  targetKey: string,
): unknown {
  if (targetKey === 'useNodeVersion') {
    return Reflect.get(sourceSettings, 'useNodeVersion')
  }

  const executionEnv = Reflect.get(sourceSettings, 'executionEnv')
  if (
    !executionEnv ||
    typeof executionEnv !== 'object' ||
    Array.isArray(executionEnv)
  ) {
    return undefined
  }

  return (executionEnv as Record<string, unknown>).nodeVersion
}

function resolveReplacementSettingKey(
  sourceKey: string,
  targetKey: string,
  npmrc: boolean,
): string | undefined {
  if (npmrc && /^node-mirror:/iu.test(sourceKey)) {
    return 'nodeDownloadMirrors'
  }

  return REPLACEMENT_SETTING_KEYS[targetKey]
}

function selectAppliedRootKeys({
  finalSettings,
  incomingSettings,
  keys,
  npmrc = false,
  runtimeApplied,
  runtimeVersion,
  sourceSettings,
}: SelectAppliedRootKeysOptions): string[] {
  return keys.filter(sourceKey => {
    const targetKey = npmrc
      ? (Object.keys(camelcaseKeys({ [sourceKey]: true }))[0] ?? sourceKey)
      : sourceKey
    if (!Object.hasOwn(incomingSettings, targetKey)) {
      if (targetKey === 'executionEnv' || targetKey === 'useNodeVersion') {
        const sourceRuntimeVersion = resolveSourceRuntimeVersion(
          sourceSettings,
          targetKey,
        )
        return (
          runtimeApplied &&
          typeof sourceRuntimeVersion === 'string' &&
          sourceRuntimeVersion === runtimeVersion
        )
      }

      if (SETTINGS_WITHOUT_REPLACEMENT.has(targetKey)) {
        return false
      }

      const replacementKey = resolveReplacementSettingKey(
        sourceKey,
        targetKey,
        npmrc,
      )
      if (!replacementKey || !Object.hasOwn(incomingSettings, replacementKey)) {
        return true
      }

      return containsMigratedValue(
        Reflect.get(finalSettings, replacementKey),
        Reflect.get(incomingSettings, replacementKey),
      )
    }

    return containsMigratedValue(
      Reflect.get(finalSettings, targetKey),
      Reflect.get(incomingSettings, targetKey),
    )
  })
}

function resolveProjectConfig(
  settings: PnpmWorkspace,
  projectName: string,
): Record<string, unknown> | undefined {
  const { packageConfigs } = settings
  if (
    !packageConfigs ||
    typeof packageConfigs !== 'object' ||
    Array.isArray(packageConfigs)
  ) {
    return undefined
  }

  const projectConfig = (packageConfigs as Record<string, unknown>)[projectName]
  return projectConfig &&
    typeof projectConfig === 'object' &&
    !Array.isArray(projectConfig)
    ? (projectConfig as Record<string, unknown>)
    : undefined
}

function selectAppliedProjectKeys(
  project: ProjectNpmrcMigrations['projects'][number],
  finalSettings: PnpmWorkspace,
): string[] {
  const finalProjectConfig = resolveProjectConfig(
    finalSettings,
    project.projectName,
  )
  if (!finalProjectConfig) {
    return []
  }

  return project.migratable.keys.filter(sourceKey => {
    const targetKey =
      Object.keys(camelcaseKeys({ [sourceKey]: true }))[0] ?? sourceKey
    return containsMigratedValue(
      finalProjectConfig[targetKey],
      project.migratable.settings[targetKey],
    )
  })
}

type PersistenceResult = Pick<
  MigrationResult,
  'changedFiles' | 'sourceSettingsCleaned' | 'packageJsonRuntimeChanged'
>

/**
 * Persist destinations before pruning any legacy source file.
 *
 * @param options - Destination files, selected sources, and cleanup policy
 *
 * @returns Changed file paths and applied cleanup/runtime changes
 */
export async function persistMigration(
  options: PersistMigrationOptions,
): Promise<PersistenceResult> {
  const {
    cleanNpmrc,
    cleanPackageJson,
    compatibility,
    finalSettings,
    incomingSettings,
    npmrc,
    npmrcExists,
    npmrcPath,
    packageJson,
    packageJsonExists,
    packageJsonPath,
    packageJsonRuntimeChanged,
    packageJsonSettings,
    pnpmWorkspaceContent,
    pnpmWorkspacePath,
    projectNpmrcs,
    runtimeVersion,
  } = options
  const appliedPackageJsonKeys = selectAppliedRootKeys({
    finalSettings,
    incomingSettings,
    keys: packageJsonSettings.keys,
    runtimeApplied: packageJsonRuntimeChanged,
    runtimeVersion,
    sourceSettings: packageJsonSettings.settings,
  })
  const appliedNpmrcKeys = selectAppliedRootKeys({
    finalSettings,
    incomingSettings,
    keys: npmrc.keys,
    npmrc: true,
    runtimeApplied: packageJsonRuntimeChanged,
    runtimeVersion,
    sourceSettings: npmrc.settings,
  })
  const yarnResolutionsApplied =
    packageJsonSettings.yarnResolutions &&
    containsMigratedValue(finalSettings.overrides, incomingSettings.overrides)
  const packageJsonSettingsChanged =
    packageJsonExists && cleanPackageJson
      ? cleanPackageJsonSettings({
          migratedKeys: appliedPackageJsonKeys,
          packageJson,
          settings: packageJsonSettings,
          yarnResolutionsApplied,
        })
      : false

  const result: PersistenceResult = {
    changedFiles: [],
    sourceSettingsCleaned: packageJsonSettingsChanged,
    packageJsonRuntimeChanged,
  }

  // A failed destination write can leave duplicates, but source values remain.
  if (await fsWriteFileIfChanged(pnpmWorkspacePath, pnpmWorkspaceContent)) {
    result.changedFiles.push(pnpmWorkspacePath)
  }

  if (
    packageJsonExists &&
    (packageJsonRuntimeChanged || packageJsonSettingsChanged)
  ) {
    await fsWriteFileIfChanged(
      packageJsonPath,
      JSON.stringify(packageJson.value, null, packageJson.indent),
    )
    result.changedFiles.push(packageJsonPath)
  }

  if (!cleanNpmrc) {
    return result
  }

  const pruneTasks = projectNpmrcs.projects.flatMap(project => {
    const appliedKeys = selectAppliedProjectKeys(project, finalSettings)
    return appliedKeys.length
      ? [
          pruneNpmrc(project.npmrcPath, compatibility, appliedKeys).then(
            () => project.npmrcPath,
          ),
        ]
      : []
  })
  if (npmrcExists && appliedNpmrcKeys.length) {
    pruneTasks.push(
      pruneNpmrc(npmrcPath, compatibility, appliedNpmrcKeys).then(
        () => npmrcPath,
      ),
    )
  }
  const cleanedNpmrcPaths = await Promise.all(pruneTasks)
  result.changedFiles.push(...cleanedNpmrcPaths)
  result.sourceSettingsCleaned ||= cleanedNpmrcPaths.length > 0
  return result
}
