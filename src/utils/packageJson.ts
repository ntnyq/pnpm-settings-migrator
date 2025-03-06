import { fsReadFile, fsWriteFile } from './fs'
import type { PackageJson } from '../types'

export async function readPackageJson(path: string): Promise<PackageJson> {
  const content = await fsReadFile(path)
  return JSON.parse(content) as PackageJson
}

export async function writePackageJson(
  path: string,
  packageJson: PackageJson,
): Promise<void> {
  // TODO: detect indent
  await fsWriteFile(path, `${JSON.stringify(packageJson, null, 2)}\n`)
}
