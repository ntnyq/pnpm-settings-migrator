import { pick } from '@ntnyq/utils'
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
  fsExists,
  fsReadFile,
  fsWriteFile,
  pruneNpmrc,
  readNpmrc,
} from './utils'
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
  const isPackageJsonExist = await fsExists(packageJsonPath)
  const isPnpmWorkspaceExist = await fsExists(pnpmWorkspaceYamlPath)

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

  const npmrcObject = isNpmrcExist ? await readNpmrc(npmrcPath) : {}

  const pnpmWorkspaceResult: PnpmWorkspace = {
    ...pick(npmrcObject, PNPM_SETTINGS_FIELDS),
    ...packageJsonObject.pnpm,
    ...pnpmWorkspaceYamlObject,
  }

  await fsWriteFile(
    pnpmWorkspaceYamlPath,
    dump(pnpmWorkspaceResult, {
      indent: pnpmWorkspaceYamlIndent,
    }),
  )

  if (isNpmrcExist && options.cleanNpmrc) {
    await pruneNpmrc(npmrcPath)
  }

  if (isPackageJsonExist && options.cleanNpmrc) {
    delete packageJsonObject.pnpm

    await fsWriteFile(
      packageJsonPath,
      JSON.stringify(packageJsonObject, null, packageJsonIndent),
    )
  }
}
