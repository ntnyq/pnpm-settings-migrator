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

/**
 * Removed settings retained in their source because no replacement is applied.
 */
const SETTINGS_WITHOUT_REPLACEMENT = new Set([
  'ignoreDepScripts',
  'ignorePatchFailures',
])
/**
 * Legacy-to-current setting keys used to verify replacements before cleanup.
 */
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
  /**
   * Whether to prune applied keys from root and project `.npmrc` files.
   */
  cleanNpmrc: boolean
  /**
   * Whether to remove applied legacy settings from the package manifest.
   */
  cleanPackageJson: boolean
  /**
   * Concrete target controlling cleanup of empty `.npmrc` files.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  /**
   * Merged destination settings used to verify source values were preserved.
   */
  finalSettings: PnpmWorkspace
  /**
   * Combined source settings after compatibility normalization.
   */
  incomingSettings: PnpmWorkspace
  /**
   * Root `.npmrc` settings and original keys selected for migration.
   */
  npmrc: MigratableNpmrc
  /**
   * Whether a root `.npmrc` exists for cleanup.
   */
  npmrcExists: boolean
  /**
   * Absolute path to the root `.npmrc`.
   */
  npmrcPath: string
  /**
   * Mutable package manifest and indentation used when writing it back.
   */
  packageJson: ParsedPackageJson
  /**
   * Whether the package manifest exists and can be persisted.
   */
  packageJsonExists: boolean
  /**
   * Absolute path to the root package manifest.
   */
  packageJsonPath: string
  /**
   * Whether runtime migration already mutated the package manifest.
   */
  packageJsonRuntimeChanged: boolean
  /**
   * Selected package settings before normalization, used to verify cleanup.
   */
  packageJsonSettings: ResolvedPackageJsonSettings
  /**
   * Serialized workspace YAML with the requested formatting applied.
   */
  pnpmWorkspaceContent: string
  /**
   * Absolute path to the destination workspace manifest.
   */
  pnpmWorkspacePath: string
  /**
   * Project source files and values to compare against final `packageConfigs`.
   */
  projectNpmrcs: ProjectNpmrcMigrations
  /**
   * Selected Node.js version that source runtime declarations must match.
   */
  runtimeVersion?: string
}

/**
 * Check that a destination contains the selected value after merging.
 *
 * Objects may have extra properties and arrays may have extra items; every
 * expected value must still be present before its source can be removed.
 *
 * @param actual - Value stored in the final destination
 * @param expected - Incoming value that must be preserved
 *
 * @returns Whether the destination recursively contains the expected value
 */
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

/**
 * Source keys and destination state used to decide which root settings to prune.
 */
interface SelectAppliedRootKeysOptions {
  /**
   * Workspace settings after applying the conflict strategy.
   */
  finalSettings: PnpmWorkspace
  /**
   * Combined source settings after normalization and replacement.
   */
  incomingSettings: PnpmWorkspace
  /**
   * Original source keys selected for migration.
   */
  keys: string[]
  /**
   * Whether keys need `.npmrc` spelling and Node.js mirror handling.
   */
  npmrc?: boolean
  /**
   * Whether the selected runtime was applied to the package manifest.
   */
  runtimeApplied: boolean
  /**
   * Runtime version selected under the conflict strategy.
   */
  runtimeVersion?: string
  /**
   * Source values before normalization, used to check runtime equality.
   */
  sourceSettings: object
}

/**
 * Read the original runtime version before checking whether cleanup is safe.
 *
 * @param sourceSettings - Legacy settings before normalization
 * @param targetKey - Runtime setting key identifying the source representation
 *
 * @returns Unvalidated runtime value, or `undefined` when it is absent
 */
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

/**
 * Find the destination key used to verify a normalized legacy setting.
 *
 * @param sourceKey - Original key, including any `.npmrc` channel suffix
 * @param targetKey - CamelCase spelling of the legacy setting
 * @param npmrc - Whether the key came from `.npmrc`
 *
 * @returns Replacement key, or `undefined` when no mapping is known
 */
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

/**
 * Select root source keys eligible for cleanup after destination merging.
 *
 * Runtime keys require a matching applied runtime. Replaced settings are
 * checked against their normalized destination values before removal.
 *
 * @param options - Selected source keys, normalized settings, and runtime status
 * @param options.finalSettings - Workspace settings after merging
 * @param options.incomingSettings - Combined source settings after normalization
 * @param options.keys - Original source keys selected for migration
 * @param options.npmrc - Whether source keys use `.npmrc` spelling
 * @param options.runtimeApplied - Whether the selected runtime was applied
 * @param options.runtimeVersion - Runtime version selected for migration
 * @param options.sourceSettings - Original source values before normalization
 *
 * @returns Original source keys that can be pruned
 */
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

/**
 * Read one project from the package-name-keyed `packageConfigs` representation.
 *
 * @param settings - Final workspace settings
 * @param projectName - Package name used as the project configuration key
 *
 * @returns Project settings, or `undefined` for missing or unsupported shapes
 */
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

/**
 * Select project `.npmrc` keys whose values survived destination merging.
 *
 * @param project - Source project and its selected settings
 * @param finalSettings - Workspace settings after merging
 *
 * @returns Original project source keys that can be pruned
 */
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
 * Migration outcome fields determined by destination writes and source cleanup.
 */
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
