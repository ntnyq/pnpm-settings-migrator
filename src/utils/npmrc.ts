import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { kebabCase } from 'uncase'
import { PNPM_SETTINGS_FIELDS } from '../constants'
import { fsReadFile, fsWriteFile } from './fs'
import type { NpmRC } from '../types'

export async function pruneNpmrc(path: string): Promise<void> {
  const pnpmSettingsFields = PNPM_SETTINGS_FIELDS.map(v => kebabCase(v))
  const content = await fsReadFile(path)
  const lines = content
    .split(/\r?\n/)
    .filter(line => !pnpmSettingsFields.some(v => line.trim().startsWith(v)))

  await fsWriteFile(path, lines.join('\n'))
}

export async function readNpmrc(path: string): Promise<NpmRC> {
  const content = await readIniFile(path)
  return camelcaseKeys(content as NpmRC)
}
