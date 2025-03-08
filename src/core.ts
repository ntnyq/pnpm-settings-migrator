import { pick } from '@ntnyq/utils'
import consola from 'consola'
import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { dump, load } from 'js-yaml'
import { resolve } from 'pathe'
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
  pruneNpmrc,
  readNpmrc,
} from './utils'
import type { PnpmSettings } from '@pnpm/types'
import type { Options } from './options'
import type { PackageJson, PnpmWorkspace } from './types'

export async function migratePnpmSettings(
  rawOptions: Options = {},
): Promise<void> {
  const options = resolveOptions(rawOptions)

  const npmrcPath = resolve(options.cwd, NPMRC)
  const packageJsonPath = resolve(options.cwd, PACKAGE_JSON)
  const pnpmWorkspaceYamlPath = resolve(options.cwd, PNPM_WORKSPACE_YAML)

  const isNpmrcExist = await fsExists(npmrcPath)
  if (!isNpmrcExist) {
    consola.info(`${dim(NPMRC)} not found`)
  }

  const isPackageJsonExist = await fsExists(packageJsonPath)
  if (!isPackageJsonExist) {
    consola.info(`${dim(PACKAGE_JSON)} not found`)
  }

  const isPnpmWorkspaceExist = await fsExists(pnpmWorkspaceYamlPath)

  // No `.npmrc` or `package.json` file
  if (!isNpmrcExist && !isPackageJsonExist) {
    consola.warn('No pnpm settings files to migrate')
    return
  }

  let packageJsonIndent: number | string = DEFAULT_INDENT
  let packageJsonObject: PackageJson = {}

  let pnpmWorkspaceYamlIndent: number = DEFAULT_INDENT
  let pnpmWorkspaceYamlObject: PnpmWorkspace = {}

  if (isPackageJsonExist) {
    const content = await fsReadFile(packageJsonPath)

    packageJsonIndent = detectIndent(content).indent
    packageJsonObject = JSON.parse(content) as PackageJson
  }

  if (isPnpmWorkspaceExist) {
    const content = await fsReadFile(pnpmWorkspaceYamlPath)

    pnpmWorkspaceYamlIndent = detectIndent(content).amount
    pnpmWorkspaceYamlObject = load(content) as PnpmWorkspace
  }

  const pnpmSettingsInNpmrc = isNpmrcExist
    ? pick(await readNpmrc(npmrcPath), PNPM_SETTINGS_FIELDS)
    : {}

  // no pnpm settings related fields
  if (
    !packageJsonObject.pnpm
    && (!options.yarnResolutions || !packageJsonObject.resolutions)
    && !Object.keys(pnpmSettingsInNpmrc).length
  ) {
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

  // Remove `overrides` if empty object
  if (
    pnpmSettingsInPackageJson.overrides
    && !Object.keys(pnpmSettingsInPackageJson.overrides).length
  ) {
    delete pnpmSettingsInPackageJson.overrides
  }

  const pnpmWorkspaceResult: PnpmWorkspace = defu(pnpmWorkspaceYamlObject, {
    ...pnpmSettingsInNpmrc,
    ...pnpmSettingsInPackageJson,
  })

  await fsWriteFile(
    pnpmWorkspaceYamlPath,
    dump(pnpmWorkspaceResult, {
      indent: pnpmWorkspaceYamlIndent,
      sortKeys: options.sortKeys,
    }),
  )

  if (isNpmrcExist && options.cleanNpmrc) {
    await pruneNpmrc(npmrcPath)
  }

  if (
    isPackageJsonExist
    && options.cleanPackageJson
    && (packageJsonObject.pnpm || packageJsonObject.resolutions)
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
}
