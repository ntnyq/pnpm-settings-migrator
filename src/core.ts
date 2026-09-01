import consola from 'consola'
import { resolve } from 'pathe'
import { NPMRC, PACKAGE_JSON, PNPM_WORKSPACE_YAML } from './constants'
import { persistMigration } from './migration-persistence'
import { resolveMigrationSources } from './migration-sources'
import { resolveOptions } from './options'
import type { Options, PnpmWorkspace } from './types'
import {
  assertCompatibleWorkspaceSettings,
  collectSettingsChanges,
  dim,
  formatRootSpacing,
  fsExists,
  mergeByStrategy,
  migrateRuntimeToPackageJson,
  normalizeIncomingSettings,
  reportSettingsChanges,
  resolveCompatibilityTarget,
  resolveRuntimeVersionByStrategy,
  updateYamlDocument,
} from './utils'
import { readPackageJson, readPnpmWorkspace } from './utils/config'

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
  npmrcKeys: string[]
  packageJsonKeys: string[]
  projectNpmrcKeys: string[]
  yarnResolutions: boolean
}): boolean {
  const {
    existingSettingsChanged,
    npmrcKeys,
    packageJsonKeys,
    projectNpmrcKeys,
    yarnResolutions,
  } = sources

  return Boolean(
    existingSettingsChanged ||
    npmrcKeys.length ||
    packageJsonKeys.length ||
    projectNpmrcKeys.length ||
    yarnResolutions,
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
 * @param rawOptions.compatibility - Target pnpm major, or automatic detection (default: auto)
 * @param rawOptions.yarnResolutions - Whether to migrate resolutions field (default: true)
 * @param rawOptions.sortKeys - Whether to sort keys in output YAML (default: false)
 * @param rawOptions.newlineBetween - Add newlines between root keys (default: true)
 * @param rawOptions.replaceDeprecated - Whether to replace deprecated settings (default: false)
 * @param rawOptions.showChanges - Show settings changes after migration (default: true)
 * @param rawOptions.strategy - Conflict handling strategy (default: merge)
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

    assertCompatibleWorkspaceSettings(pnpmWorkspace.value, compatibility)
    const sources = await resolveMigrationSources({
      compatibility,
      cwd: options.cwd,
      npmrcExists,
      npmrcPath,
      packageJson: packageJson.value,
      pnpmWorkspace: pnpmWorkspace.value,
      yarnResolutions: options.yarnResolutions,
    })
    const { incomingSettings } = sources

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
        npmrcKeys: sources.npmrc.keys,
        packageJsonKeys: sources.packageJson.keys,
        projectNpmrcKeys: sources.projectNpmrcs.projects.flatMap(
          project => project.migratable.keys,
        ),
        yarnResolutions: sources.packageJson.yarnResolutions,
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

    await persistMigration({
      cleanNpmrc: options.cleanNpmrc,
      cleanPackageJson: options.cleanPackageJson,
      compatibility,
      npmrc: sources.npmrc,
      npmrcExists,
      npmrcPath,
      packageJson,
      packageJsonExists,
      packageJsonPath,
      packageJsonRuntimeChanged: runtimeMigration.changed,
      packageJsonSettings: sources.packageJson,
      pnpmWorkspaceContent: finalYamlContent,
      pnpmWorkspacePath: pnpmWorkspaceYamlPath,
      projectNpmrcs: sources.projectNpmrcs,
    })

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
