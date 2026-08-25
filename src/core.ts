import consola from 'consola'
import { resolve } from 'pathe'
import { NPMRC, PACKAGE_JSON, PNPM_WORKSPACE_YAML } from './constants'
import { resolveOptions } from './options'
import type { Options, PackageJson, PnpmWorkspace } from './types'
import {
  collectSettingsChanges,
  dim,
  formatRootSpacing,
  fsExists,
  fsWriteFile,
  mergeByStrategy,
  migrateRuntimeToPackageJson,
  normalizeIncomingSettings,
  pruneNpmrc,
  readMigratableNpmrc,
  reportSettingsChanges,
  resolveCompatibilityTarget,
  resolveRuntimeVersionByStrategy,
  updateYamlDocument,
} from './utils'
import {
  readPackageJson,
  readPnpmWorkspace,
  resolvePackageJsonSettings,
} from './utils/config'

function hasSettingsSources(
  npmrcExists: boolean,
  packageJsonExists: boolean,
  pnpmWorkspaceExists: boolean,
): boolean {
  if (!npmrcExists) {
    consola.info(`${dim(NPMRC)} not found`)
  }

  if (!packageJsonExists) {
    consola.info(`${dim(PACKAGE_JSON)} not found`)
  }

  if (npmrcExists || packageJsonExists || pnpmWorkspaceExists) {
    return true
  }

  consola.warn('No pnpm settings files to migrate')
  return false
}

function hasMigratableSettings(sources: {
  existingSettingsChanged: boolean
  packageJson: PackageJson
  pnpmSettingsInNpmrc: PnpmWorkspace
  yarnResolutions: boolean
}): boolean {
  const {
    existingSettingsChanged,
    packageJson,
    pnpmSettingsInNpmrc,
    yarnResolutions,
  } = sources

  return Boolean(
    existingSettingsChanged ||
    packageJson.pnpm ||
    (yarnResolutions && packageJson.resolutions) ||
    Object.keys(pnpmSettingsInNpmrc).length,
  )
}

function assertCanMigrateRuntime(
  runtimeVersion: string | undefined,
  packageJsonExists: boolean,
): void {
  if (runtimeVersion && !packageJsonExists) {
    throw new Error(
      'Cannot migrate the removed Node.js runtime setting without a package.json file.',
    )
  }
}

function reportMigrationChanges(
  showChanges: boolean,
  before: PnpmWorkspace = {},
  after: PnpmWorkspace = {},
): void {
  if (!showChanges) {
    return
  }

  reportSettingsChanges(collectSettingsChanges(before, after))
}

/**
 * Migrate pnpm settings from legacy locations to `pnpm-workspace.yaml`.
 *
 * This function collects pnpm configurations from multiple sources and consolidates
 * them into a single `pnpm-workspace.yaml` file:
 * - `package.json` pnpm field
 * - `.npmrc` pnpm-related settings
 * - `package.json` resolutions (optional, converts to pnpm overrides)
 * - deprecated settings already present in `pnpm-workspace.yaml`
 *
 * @param rawOptions - Migration options
 * @param rawOptions.cwd - Current working directory (default: process.cwd())
 * @param rawOptions.cleanNpmrc - Whether to remove pnpm settings from `.npmrc` (default: true)
 * @param rawOptions.cleanPackageJson - Whether to remove pnpm field from `package.json` (default: true)
 * @param rawOptions.yarnResolutions - Whether to migrate resolutions field (default: true)
 * @param rawOptions.sortKeys - Whether to sort keys in output YAML (default: false)
 * @param rawOptions.newlineBetween - Add newlines between root keys (default: true)
 * @param rawOptions.showChanges - Show settings changes after migration (default: true)
 *
 * @returns A promise that resolves when migration is complete
 *
 * @throws {Error} When file operations fail or JSON/YAML parsing errors occur
 *
 * @example
 * ```ts
 * // Migrate with default options
 * await migratePnpmSettings()
 *
 * // Migrate with custom options
 * await migratePnpmSettings({
 *   cwd: '/path/to/workspace',
 *   cleanNpmrc: false,
 *   sortKeys: true
 * })
 * ```
 */
export async function migratePnpmSettings(
  rawOptions: Options = {},
): Promise<void> {
  try {
    const options = resolveOptions(rawOptions)

    const npmrcPath = resolve(options.cwd, NPMRC)
    const packageJsonPath = resolve(options.cwd, PACKAGE_JSON)
    const pnpmWorkspaceYamlPath = resolve(options.cwd, PNPM_WORKSPACE_YAML)

    const [npmrcExists, packageJsonExists, pnpmWorkspaceExists] =
      await Promise.all([
        fsExists(npmrcPath),
        fsExists(packageJsonPath),
        fsExists(pnpmWorkspaceYamlPath),
      ])

    if (
      !hasSettingsSources(npmrcExists, packageJsonExists, pnpmWorkspaceExists)
    ) {
      reportMigrationChanges(options.showChanges)
      return
    }

    const [packageJson, pnpmWorkspace] = await Promise.all([
      readPackageJson(packageJsonPath, packageJsonExists),
      readPnpmWorkspace(pnpmWorkspaceYamlPath, pnpmWorkspaceExists),
    ])
    const pnpmWorkspaceBefore = structuredClone(pnpmWorkspace.value)

    const compatibility = resolveCompatibilityTarget(
      options.compatibility,
      packageJson.value.packageManager,
      packageJson.value.devEngines?.packageManager,
    )

    const npmrcMigratable = npmrcExists
      ? await readMigratableNpmrc(npmrcPath, compatibility)
      : { keys: [], settings: {} }
    const pnpmSettingsInNpmrc = npmrcMigratable.settings

    const pnpmSettingsInPackageJson = resolvePackageJsonSettings(
      packageJson.value,
      options.yarnResolutions,
    )

    // package.json keeps scalar precedence, while collection settings from both
    // legacy sources are retained.
    const incomingSettings = mergeByStrategy(
      pnpmSettingsInPackageJson,
      pnpmSettingsInNpmrc,
      'merge',
    )

    const [existingNormalization, incomingNormalization] = await Promise.all([
      normalizeIncomingSettings(pnpmWorkspace.value, {
        compatibility,
        cwd: options.cwd,
        replaceDeprecated: options.replaceDeprecated,
      }),
      normalizeIncomingSettings(incomingSettings, {
        compatibility,
        cwd: options.cwd,
        replaceDeprecated: options.replaceDeprecated,
      }),
    ])

    for (const warning of [
      ...existingNormalization.warnings,
      ...incomingNormalization.warnings,
    ]) {
      consola.warn(warning)
    }

    const runtimeVersion = resolveRuntimeVersionByStrategy(
      existingNormalization.runtimeVersion,
      incomingNormalization.runtimeVersion,
      options.strategy,
    )

    assertCanMigrateRuntime(runtimeVersion, packageJsonExists)

    const runtimeMigration = migrateRuntimeToPackageJson(
      packageJson.value,
      runtimeVersion,
    )
    if (runtimeMigration.warning) {
      consola.warn(runtimeMigration.warning)
    }

    if (
      !hasMigratableSettings({
        existingSettingsChanged: existingNormalization.changed,
        packageJson: packageJson.value,
        pnpmSettingsInNpmrc,
        yarnResolutions: options.yarnResolutions,
      })
    ) {
      consola.warn('No pnpm settings fields to migrate')
      reportMigrationChanges(options.showChanges)
      return
    }

    // Merge based on strategy
    const pnpmWorkspaceResult: PnpmWorkspace = mergeByStrategy(
      pnpmWorkspace.value,
      incomingSettings,
      options.strategy,
    )

    updateYamlDocument(pnpmWorkspace.document, {
      after: pnpmWorkspaceResult,
      before: pnpmWorkspaceBefore,
      sortKeys: options.sortKeys,
    })
    const yamlContent = pnpmWorkspace.document.toString({
      indent: pnpmWorkspace.indent,
    })

    const finalYamlContent = formatRootSpacing(
      yamlContent,
      options.newlineBetween,
    )

    let packageJsonChanged = runtimeMigration.changed

    if (packageJsonExists && options.cleanPackageJson) {
      if (packageJson.value.pnpm) {
        packageJsonChanged = true
      }
      delete packageJson.value.pnpm

      if (options.yarnResolutions && packageJson.value.resolutions) {
        packageJsonChanged = true
        delete packageJson.value.resolutions
      }
    }

    // Persist destinations before removing either legacy source. A failed write
    // can then leave duplicate settings, but never delete the only copy.
    await fsWriteFile(pnpmWorkspaceYamlPath, finalYamlContent)

    if (packageJsonExists && packageJsonChanged) {
      await fsWriteFile(
        packageJsonPath,
        JSON.stringify(packageJson.value, null, packageJson.indent),
      )
    }

    if (npmrcExists && options.cleanNpmrc) {
      await pruneNpmrc(npmrcPath, compatibility, npmrcMigratable.keys)
    }

    reportMigrationChanges(
      options.showChanges,
      pnpmWorkspaceBefore,
      pnpmWorkspaceResult,
    )
  } catch (err) {
    consola.error('Failed to migrate pnpm settings:', err)
    throw err
  }
}
