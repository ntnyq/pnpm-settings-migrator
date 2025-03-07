import { pick } from '@ntnyq/utils'
import { resolve } from 'pathe'
import {
  NPMRC,
  PACKAGE_JSON,
  PNPM_SETTINGS_FIELDS,
  PNPM_WORKSPACE_YAML,
} from './constants'
import { resolveOptions } from './options'
import {
  fsExists,
  pruneNpmrc,
  prunePackageJson,
  readNpmrc,
  readPackageJson,
  readPnpmWorkspace,
  writePnpmWorkspace,
} from './utils'
import type { Options } from './options'

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

  const pnpmWorkspaceContent = {
    ...(isNpmrcExist
      ? pick(await readNpmrc(npmrcPath), PNPM_SETTINGS_FIELDS)
      : {}),
    ...(isPackageJsonExist
      ? (await readPackageJson(packageJsonPath)).pnpm
      : {}),
    ...(isPnpmWorkspaceExist
      ? await readPnpmWorkspace(pnpmWorkspaceYamlPath)
      : {}),
  }

  await writePnpmWorkspace(pnpmWorkspaceYamlPath, pnpmWorkspaceContent)

  if (isNpmrcExist && options.cleanNpmrc) {
    await pruneNpmrc(npmrcPath)
  }

  if (isPackageJsonExist && options.cleanNpmrc) {
    await prunePackageJson(packageJsonPath)
  }
}
