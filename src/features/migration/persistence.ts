import { isArray, isPlainObject, isString } from '@ntnyq/utils'
import camelcaseKeys from 'camelcase-keys'
import {
  REPLACEMENT_SETTING_KEYS,
  SETTINGS_WITHOUT_REPLACEMENT,
} from '../../constants'
import type {
  SelectAppliedRootKeysOptions,
  PnpmWorkspace,
  ProjectNpmrcMigrations,
  PersistMigrationOptions,
  PersistenceResult,
} from '../../types'
import { fsWriteFileIfChanged } from '../../utils/fs'
import { cleanPackageJsonSettings } from '../sources/config'
import { pruneNpmrc } from '../sources/npmrc'

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
  if (isArray(actual) && isArray(expected)) {
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
 * Resolve project matchers using pnpm's last-entry-wins behavior.
 *
 * @param packageConfigs - Source or destination project configuration
 *
 * @returns Effective settings, or undefined for an absent or malformed source
 */
function resolvePackageConfigs(
  packageConfigs: unknown,
): Record<string, unknown> | undefined {
  if (!isArray(packageConfigs)) {
    return isPlainObject(packageConfigs) ? packageConfigs : undefined
  }
  const entries: [string, unknown][] = []
  for (const entry of packageConfigs) {
    if (!isPlainObject(entry)) {
      return undefined
    }
    const { match, ...settings } = entry
    if (!isArray(match) || !match.every(isString)) {
      return undefined
    }
    entries.push(...match.map((name): [string, unknown] => [name, settings]))
  }
  return Object.fromEntries(entries)
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
    isArray(executionEnv)
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
 * @param options.normalizedSettings - This source's settings after normalization
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
  normalizedSettings,
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
    if (!Object.hasOwn(normalizedSettings, targetKey)) {
      if (targetKey === 'executionEnv' || targetKey === 'useNodeVersion') {
        const sourceRuntimeVersion = resolveSourceRuntimeVersion(
          sourceSettings,
          targetKey,
        )
        return (
          runtimeApplied &&
          isString(sourceRuntimeVersion) &&
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
      if (
        !replacementKey ||
        !Object.hasOwn(normalizedSettings, replacementKey)
      ) {
        return true
      }

      return containsMigratedValue(
        Reflect.get(finalSettings, replacementKey),
        Reflect.get(normalizedSettings, replacementKey),
      )
    }

    if (targetKey === 'packageConfigs') {
      const actual = resolvePackageConfigs(finalSettings.packageConfigs)
      const expected = resolvePackageConfigs(normalizedSettings.packageConfigs)
      return Boolean(
        actual && expected && containsMigratedValue(actual, expected),
      )
    }

    return containsMigratedValue(
      Reflect.get(finalSettings, targetKey),
      Reflect.get(normalizedSettings, targetKey),
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
    isArray(packageConfigs)
  ) {
    return undefined
  }

  const projectConfig = (packageConfigs as Record<string, unknown>)[projectName]
  return projectConfig &&
    typeof projectConfig === 'object' &&
    !isArray(projectConfig)
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
    normalizedPackageJsonSettings,
    normalizedNpmrcSettings,
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
    runtimeApplied,
  } = options
  const appliedPackageJsonKeys = selectAppliedRootKeys({
    finalSettings,
    normalizedSettings: normalizedPackageJsonSettings,
    keys: packageJsonSettings.keys,
    runtimeApplied,
    runtimeVersion,
    sourceSettings: packageJsonSettings.settings,
  })
  const appliedNpmrcKeys = selectAppliedRootKeys({
    finalSettings,
    normalizedSettings: normalizedNpmrcSettings,
    keys: npmrc.keys,
    npmrc: true,
    runtimeApplied,
    runtimeVersion,
    sourceSettings: npmrc.settings,
  })
  const migratedResolutionKeys = Object.entries(
    packageJsonSettings.yarnResolutionSelectors,
  )
    .filter(([key, selector]) =>
      containsMigratedValue(
        finalSettings.overrides?.[selector],
        packageJson.value.resolutions?.[key],
      ),
    )
    .map(([key]) => key)
  const runtimeContent = packageJsonRuntimeChanged
    ? JSON.stringify(packageJson.value, null, packageJson.indent)
    : undefined
  const packageJsonSettingsChanged =
    packageJsonExists && cleanPackageJson
      ? cleanPackageJsonSettings({
          migratedKeys: appliedPackageJsonKeys,
          packageJson,
          migratedResolutionKeys,
        })
      : false

  const result: PersistenceResult = {
    changedFiles: [],
    sourceSettingsCleaned: packageJsonSettingsChanged,
    packageJsonRuntimeChanged,
  }

  // Stage the runtime destination without pruning any package source settings.
  if (packageJsonExists && runtimeContent !== undefined) {
    if (await fsWriteFileIfChanged(packageJsonPath, runtimeContent)) {
      result.changedFiles.push(packageJsonPath)
    }
  }

  // Both migration directions now retain their source if a destination fails.
  if (await fsWriteFileIfChanged(pnpmWorkspacePath, pnpmWorkspaceContent)) {
    result.changedFiles.push(pnpmWorkspacePath)
  }

  if (packageJsonExists && packageJsonSettingsChanged) {
    await fsWriteFileIfChanged(
      packageJsonPath,
      JSON.stringify(packageJson.value, null, packageJson.indent),
    )
    if (!result.changedFiles.includes(packageJsonPath)) {
      result.changedFiles.push(packageJsonPath)
    }
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
