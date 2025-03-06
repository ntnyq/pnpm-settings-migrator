import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { fsRemoveFile } from './fs'
import type { NpmRC } from '../types'

export async function readNpmrc(path: string): Promise<NpmRC> {
  const content = await readIniFile(path)
  return camelcaseKeys(content as Record<string, any>) as NpmRC
}

export async function removeNpmrc(path: string): Promise<void> {
  await fsRemoveFile(path)
}
