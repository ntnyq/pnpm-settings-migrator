import { resolve } from 'pathe'
import { NPMRC, PACKAGE_JSON, PNPM_WORKSPACE_YAML } from './constants'
import { persistMigration } from './migration-persistence'
import { resolveMigrationSources } from './migration-sources'
import { resolveOptions } from './options'
import type { MigrationResult, Options, PnpmWorkspace } from './types'
import {
  assertCompatibleWorkspaceSettings,
  collectSettingsChanges,
  formatRootSpacing,
  fsExists,
  mergeByStrategy,
  migrateRuntimeToPackageJson,
  normalizeIncomingSettings,
  resolveCompatibilityTarget,
  resolveRuntimeVersionByStrategy,
  updateYamlDocument,
} from './utils'
import { readPackageJson, readPnpmWorkspace } from './utils/config'

/**
 * Check whether source selection or workspace normalization requires a write.
 *
 * @param sources - Selected source keys and normalization status
 *
 * @returns Whether any settings were selected or normalized
 */
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

/**
 * Require an existing package manifest before moving a Node.js runtime setting.
 *
 * @param runtimeVersion - Legacy runtime version selected for migration
 * @param packageJsonExists - Whether the destination package manifest exists
 *
 * @returns Nothing when no runtime is selected or its destination exists
 *
 * @throws {Error} When a runtime is selected without a package manifest
 */
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
 * @param rawOptions.showChanges - CLI display preference; does not affect the result
 * @param rawOptions.strategy - Conflict handling strategy (default: merge)
 *
 * @returns Settings changes, changed files, cleanup status, and warnings; no logs are emitted
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
): Promise<MigrationResult> {
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

  const result: MigrationResult = {
    hasConfigurationFiles:
      npmrcExists || packageJsonExists || pnpmWorkspaceExists,
    settingsChanges: [],
    changedFiles: [],
    sourceSettingsCleaned: false,
    packageJsonRuntimeChanged: false,
    warnings: [],
  }
  if (!result.hasConfigurationFiles) {
    return result
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
    strategy: options.strategy,
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

  result.warnings.push(
    ...sources.warnings,
    ...existingNormalization.warnings,
    ...incomingNormalization.warnings,
  )

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
    result.warnings.push(runtimeMigration.warning)
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
    return result
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

  const persistence = await persistMigration({
    cleanNpmrc: options.cleanNpmrc,
    cleanPackageJson: options.cleanPackageJson,
    compatibility,
    finalSettings: pnpmWorkspaceResult,
    incomingSettings,
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
    runtimeVersion,
  })

  return {
    ...result,
    ...persistence,
    settingsChanges: collectSettingsChanges(
      pnpmWorkspaceBefore,
      pnpmWorkspaceResult,
    ),
  }
}
