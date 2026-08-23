import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { parse } from 'yaml'
import { DEFAULT_INDENT } from '../constants'
import type { PackageJson, PnpmWorkspace } from '../types'
import { fsReadFile } from './fs'

export interface ParsedPackageJson {
  indent: number | string
  value: PackageJson
}

export interface ParsedPnpmWorkspace {
  indent: number
  value: PnpmWorkspace
}

function resolveYamlIndent(content: string): number {
  const detectedIndent = detectIndent(content).amount

  return detectedIndent > 0 ? detectedIndent : DEFAULT_INDENT
}

export async function readPackageJson(
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

export async function readPnpmWorkspace(
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

export function resolvePackageJsonSettings(
  packageJson: PackageJson,
  yarnResolutions: boolean,
): PnpmWorkspace {
  const pnpmSettings: PnpmWorkspace =
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
