import detectIndent from 'detect-indent'
import { fsReadFile, fsWriteFile } from './fs'
import type { PackageJson } from '../types'

export async function prunePackageJson(path: string): Promise<void> {
  const content = await fsReadFile(path)
  const indent = detectIndent(content)
  const packageJson = JSON.parse(content) as PackageJson

  delete packageJson.pnpm

  await fsWriteFile(path, JSON.stringify(packageJson, null, indent.indent || 2))
}

export async function readPackageJson(path: string): Promise<PackageJson> {
  const content = await fsReadFile(path)
  return JSON.parse(content) as PackageJson
}
