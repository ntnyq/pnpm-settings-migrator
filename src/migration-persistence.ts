import camelcaseKeys from 'camelcase-keys'
import type { CompatibilityTarget, PnpmWorkspace } from './types'
import { fsWriteFile, pruneNpmrc } from './utils'
import type {
  ParsedPackageJson,
  ResolvedPackageJsonSettings,
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

interface CleanPackageJsonSettingsOptions {
  migratedKeys: string[]
  packageJson: ParsedPackageJson
  settings: ResolvedPackageJsonSettings
  yarnResolutionsApplied: boolean
}

function cleanPackageJsonSettings({
  migratedKeys,
  packageJson,
  settings,
  yarnResolutionsApplied,
}: CleanPackageJsonSettingsOptions): boolean {
  let changed = false
  if (packageJson.value.pnpm) {
    for (const key of migratedKeys) {
      Reflect.deleteProperty(packageJson.value.pnpm, key)
      changed = true
    }
    if (!Object.keys(packageJson.value.pnpm).length) {
      delete packageJson.value.pnpm
    }
  }

  if (settings.yarnResolutions && yarnResolutionsApplied) {
    changed = true
    delete packageJson.value.resolutions
  }

  return changed
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

/**
 * Persist destinations before pruning any legacy source file.
 *
 * @param options - Destination files, selected sources, and cleanup policy
 *
 * @returns A promise that resolves after destinations and sources are persisted
 */
export async function persistMigration(
  options: PersistMigrationOptions,
): Promise<void> {
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

  // A failed destination write can leave duplicates, but source values remain.
  await fsWriteFile(pnpmWorkspacePath, pnpmWorkspaceContent)

  if (
    packageJsonExists &&
    (packageJsonRuntimeChanged || packageJsonSettingsChanged)
  ) {
    await fsWriteFile(
      packageJsonPath,
      JSON.stringify(packageJson.value, null, packageJson.indent),
    )
  }

  if (!cleanNpmrc) {
    return
  }

  const pruneTasks = projectNpmrcs.projects.flatMap(project => {
    const appliedKeys = selectAppliedProjectKeys(project, finalSettings)
    return appliedKeys.length
      ? [pruneNpmrc(project.npmrcPath, compatibility, appliedKeys)]
      : []
  })
  if (npmrcExists && appliedNpmrcKeys.length) {
    pruneTasks.push(pruneNpmrc(npmrcPath, compatibility, appliedNpmrcKeys))
  }
  await Promise.all(pruneTasks)
}
