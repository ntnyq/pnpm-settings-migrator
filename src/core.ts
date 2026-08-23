import type { PnpmSettings } from '@pnpm/types'
import consola from 'consola'
import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { parse, Document as YamlDocument } from 'yaml'
import {
  DEFAULT_INDENT,
  NPMRC,
  PACKAGE_JSON,
  PNPM_WORKSPACE_YAML,
} from './constants'
import { resolveOptions } from './options'
import type { Options, PackageJson, PnpmWorkspace } from './types'
import {
  dim,
  fsExists,
  fsReadFile,
  fsWriteFile,
  mergeByStrategy,
  normalizeIncomingSettings,
  pruneNpmrc,
  readMigratableNpmrc,
  resolveCompatibilityTarget,
} from './utils'

interface ParsedPackageJson {
  indent: number | string
  value: PackageJson
}

interface ParsedPnpmWorkspace {
  indent: number
  value: PnpmWorkspace
}

function resolveYamlIndent(content: string): number {
  const detectedIndent = detectIndent(content).amount

  return detectedIndent > 0 ? detectedIndent : DEFAULT_INDENT
}

function hasSettingsSources(
  npmrcExists: boolean,
  packageJsonExists: boolean,
): boolean {
  if (!npmrcExists) {
    consola.info(`${dim(NPMRC)} not found`)
  }

  if (!packageJsonExists) {
    consola.info(`${dim(PACKAGE_JSON)} not found`)
  }

  if (npmrcExists || packageJsonExists) {
    return true
  }

  consola.warn('No pnpm settings files to migrate')
  return false
}

async function readPackageJson(
  path: string,
  exists: boolean,
): Promise<ParsedPackageJson> {
  if (!exists) {
    return { indent: DEFAULT_INDENT, value: {} }
  }

  const content = await fsReadFile(path)

  return {
    indent: detectIndent(content).indent,
    value: JSON.parse(content) as PackageJson,
  }
}

async function readPnpmWorkspace(
  path: string,
  exists: boolean,
): Promise<ParsedPnpmWorkspace> {
  if (!exists) {
    return { indent: DEFAULT_INDENT, value: {} }
  }

  const content = await fsReadFile(path)

  return {
    indent: resolveYamlIndent(content),
    value: (parse(content) as PnpmWorkspace | null) ?? {},
  }
}

function hasMigratableSettings(
  packageJson: PackageJson,
  pnpmSettingsInNpmrc: PnpmWorkspace,
  yarnResolutions: boolean,
): boolean {
  return Boolean(
    packageJson.pnpm ||
    (yarnResolutions && packageJson.resolutions) ||
    Object.keys(pnpmSettingsInNpmrc).length,
  )
}

function resolvePackageJsonSettings(
  packageJson: PackageJson,
  yarnResolutions: boolean,
): PnpmSettings {
  const pnpmSettings: PnpmSettings =
    yarnResolutions && packageJson.resolutions
      ? {
          ...packageJson.pnpm,
          overrides: defu(packageJson.pnpm?.overrides, packageJson.resolutions),
        }
      : { ...packageJson.pnpm }

  if (pnpmSettings.overrides && !Object.keys(pnpmSettings.overrides).length) {
    delete pnpmSettings.overrides
  }

  return pnpmSettings
}

/**
 * Migrate pnpm settings from legacy locations to `pnpm-workspace.yaml`.
 *
 * This function collects pnpm configurations from multiple sources and consolidates
 * them into a single `pnpm-workspace.yaml` file:
 * - `package.json` pnpm field
 * - `.npmrc` pnpm-related settings
 * - `package.json` resolutions (optional, converts to pnpm overrides)
 *
 * @param rawOptions - Migration options
 * @param rawOptions.cwd - Current working directory (default: process.cwd())
 * @param rawOptions.cleanNpmrc - Whether to remove pnpm settings from `.npmrc` (default: true)
 * @param rawOptions.cleanPackageJson - Whether to remove pnpm field from `package.json` (default: true)
 * @param rawOptions.yarnResolutions - Whether to migrate resolutions field (default: true)
 * @param rawOptions.sortKeys - Whether to sort keys in output YAML (default: false)
 * @param rawOptions.newlineBetween - Add newlines between root keys (default: true)
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

    if (!hasSettingsSources(npmrcExists, packageJsonExists)) {
      return
    }

    const [packageJson, pnpmWorkspace] = await Promise.all([
      readPackageJson(packageJsonPath, packageJsonExists),
      readPnpmWorkspace(pnpmWorkspaceYamlPath, pnpmWorkspaceExists),
    ])

    const compatibility = resolveCompatibilityTarget(
      options.compatibility,
      packageJson.value.packageManager,
    )

    const npmrcMigratable = npmrcExists
      ? await readMigratableNpmrc(npmrcPath, compatibility)
      : { keys: [], settings: {} }
    const pnpmSettingsInNpmrc = npmrcMigratable.settings

    if (
      !hasMigratableSettings(
        packageJson.value,
        pnpmSettingsInNpmrc,
        options.yarnResolutions,
      )
    ) {
      consola.warn('No pnpm settings fields to migrate')
      return
    }

    const pnpmSettingsInPackageJson = resolvePackageJsonSettings(
      packageJson.value,
      options.yarnResolutions,
    )

    // Collect incoming settings from package.json and .npmrc
    const incomingSettings: PnpmWorkspace = {
      ...pnpmSettingsInNpmrc,
      ...pnpmSettingsInPackageJson,
    }

    normalizeIncomingSettings(
      incomingSettings,
      compatibility,
      options.replaceDeprecated,
    )

    // Merge based on strategy
    const pnpmWorkspaceResult: PnpmWorkspace = mergeByStrategy(
      pnpmWorkspace.value,
      incomingSettings,
      options.strategy,
    )

    const yamlDocument = new YamlDocument(
      {},
      {
        sortMapEntries: options.sortKeys,
      },
    )

    Object.entries(pnpmWorkspaceResult).forEach(([key, value]) => {
      yamlDocument.add({ key, value })
    })

    const yamlContent = yamlDocument.toString({
      indent: pnpmWorkspace.indent,
    })

    const finalYamlContent = options.newlineBetween
      ? yamlContent.replace(/\n(?=[^\s#][^:\n]*:)/gu, '\n\n')
      : yamlContent

    await fsWriteFile(pnpmWorkspaceYamlPath, finalYamlContent)

    if (npmrcExists && options.cleanNpmrc) {
      await pruneNpmrc(npmrcPath, compatibility, npmrcMigratable.keys)
    }

    if (
      packageJsonExists &&
      options.cleanPackageJson &&
      (packageJson.value.pnpm || packageJson.value.resolutions)
    ) {
      delete packageJson.value.pnpm

      if (options.yarnResolutions) {
        delete packageJson.value.resolutions
      }

      await fsWriteFile(
        packageJsonPath,
        JSON.stringify(packageJson.value, null, packageJson.indent),
      )
    }
  } catch (err) {
    consola.error('Failed to migrate pnpm settings:', err)
    throw err
  }
}
