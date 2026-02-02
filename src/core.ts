import { pick } from '@ntnyq/utils'
import consola from 'consola'
import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { parse, Document as YamlDocument } from 'yaml'
import {
  DEFAULT_INDENT,
  NPMRC,
  PACKAGE_JSON,
  PNPM_SETTINGS_FIELDS,
  PNPM_WORKSPACE_YAML,
} from './constants'
import { resolveOptions } from './options'
import {
  dim,
  fsExists,
  fsReadFile,
  fsWriteFile,
  mergeByStrategy,
  pruneNpmrc,
  readNpmrc,
} from './utils'
import type { PnpmSettings } from '@pnpm/types'
import type { Options, PackageJson, PnpmWorkspace } from './types'

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

    if (!npmrcExists) {
      consola.info(`${dim(NPMRC)} not found`)
    }

    if (!packageJsonExists) {
      consola.info(`${dim(PACKAGE_JSON)} not found`)
    }

    // No `.npmrc` or `package.json` file
    if (!npmrcExists && !packageJsonExists) {
      consola.warn('No pnpm settings files to migrate')
      return
    }

    let packageJsonIndent: number | string = DEFAULT_INDENT
    let packageJsonObject: PackageJson = {}

    let pnpmWorkspaceYamlIndent: number = DEFAULT_INDENT
    let pnpmWorkspaceYamlObject: PnpmWorkspace = {}

    if (packageJsonExists) {
      const content = await fsReadFile(packageJsonPath)

      packageJsonIndent = detectIndent(content).indent
      packageJsonObject = JSON.parse(content) as PackageJson
    }

    if (pnpmWorkspaceExists) {
      const content = await fsReadFile(pnpmWorkspaceYamlPath)

      pnpmWorkspaceYamlIndent = detectIndent(content).amount
      pnpmWorkspaceYamlObject = parse(content) as PnpmWorkspace
    }

    const pnpmSettingsInNpmrc = npmrcExists
      ? pick(await readNpmrc(npmrcPath), PNPM_SETTINGS_FIELDS)
      : {}

    // no pnpm settings related fields
    const hasPnpmInPackageJson = !!packageJsonObject.pnpm
    const hasResolutions =
      options.yarnResolutions && !!packageJsonObject.resolutions
    const hasNpmrcSettings = Object.keys(pnpmSettingsInNpmrc).length > 0

    if (!hasPnpmInPackageJson && !hasResolutions && !hasNpmrcSettings) {
      consola.warn('No pnpm settings fields to migrate')
      return
    }

    const pnpmSettingsInPackageJson: PnpmSettings =
      options.yarnResolutions && packageJsonObject.resolutions
        ? {
            ...packageJsonObject.pnpm,
            overrides: defu(
              packageJsonObject.pnpm?.overrides,
              packageJsonObject.resolutions,
            ),
          }
        : { ...packageJsonObject.pnpm }

    // Remove `overrides` if it's empty
    if (
      pnpmSettingsInPackageJson.overrides &&
      !Object.keys(pnpmSettingsInPackageJson.overrides).length
    ) {
      delete pnpmSettingsInPackageJson.overrides
    }

    // Collect incoming settings from package.json and .npmrc
    const incomingSettings: PnpmWorkspace = {
      ...pnpmSettingsInNpmrc,
      ...pnpmSettingsInPackageJson,
    }

    // Merge based on strategy
    const pnpmWorkspaceResult: PnpmWorkspace = mergeByStrategy(
      pnpmWorkspaceYamlObject,
      incomingSettings,
      options.strategy,
    )

    const yamlDocument = new YamlDocument(
      {},
      {
        sortMapEntries: options.sortKeys,
      },
    )

    Object.entries(pnpmWorkspaceResult).forEach(([key, value], index) => {
      yamlDocument.add({ key, value })

      if (
        options.newlineBetween &&
        index < Object.keys(pnpmWorkspaceResult).length - 1
      ) {
        // add a newlines
        // yamlDocument.add({
        //   key: '',
        //   value: null,
        // })
      }
    })

    await fsWriteFile(
      pnpmWorkspaceYamlPath,
      yamlDocument.toString({
        indent: pnpmWorkspaceYamlIndent,
      }),
    )

    if (npmrcExists && options.cleanNpmrc) {
      await pruneNpmrc(npmrcPath)
    }

    if (
      packageJsonExists &&
      options.cleanPackageJson &&
      (packageJsonObject.pnpm || packageJsonObject.resolutions)
    ) {
      delete packageJsonObject.pnpm

      if (options.yarnResolutions) {
        delete packageJsonObject.resolutions
      }

      await fsWriteFile(
        packageJsonPath,
        JSON.stringify(packageJsonObject, null, packageJsonIndent),
      )
    }
  } catch (err) {
    consola.error('Failed to migrate pnpm settings:', err)
    throw err
  }
}
