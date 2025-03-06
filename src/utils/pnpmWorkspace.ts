import { dump, load } from 'js-yaml'
import { fsReadFile, fsWriteFile } from './fs'
import type { PnpmWorkspace } from '../types'

export async function readPnpmWorkspace(path: string): Promise<PnpmWorkspace> {
  const content = await fsReadFile(path)
  return load(content) as PnpmWorkspace
}

export async function writePnpmWorkspace(
  path: string,
  pnpmWorkspace: PnpmWorkspace,
): Promise<void> {
  await fsWriteFile(path, dump(pnpmWorkspace))
}
