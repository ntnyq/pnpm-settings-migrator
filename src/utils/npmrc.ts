import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { kebabCase } from 'uncase'
import { PNPM_SETTINGS_FIELDS } from '../constants'
import { fsReadFile, fsWriteFile } from './fs'
import type { NpmRC } from '../types'

/**
 * Remove pnpm-related settings from `.npmrc` file.
 *
 * This function reads the `.npmrc` file, filters out all lines that start with
 * pnpm-specific configuration keys (as defined in PNPM_SETTINGS_FIELDS), and
 * writes the cleaned content back to the file.
 *
 * @param path - Absolute path to the `.npmrc` file
 *
 * @returns A promise that resolves when the file has been pruned
 *
 * @throws {Error} When file read/write operations fail
 *
 * @example
 * ```ts
 * await pruneNpmrc('/path/to/.npmrc')
 * ```
 */
export async function pruneNpmrc(path: string): Promise<void> {
  const pnpmSettingsFields = PNPM_SETTINGS_FIELDS.map(v => kebabCase(v))
  const content = await fsReadFile(path)
  const lines = content
    .split(/\r?\n/)
    .filter(line => !pnpmSettingsFields.some(v => line.trim().startsWith(v)))

  await fsWriteFile(path, lines.join('\n'))
}

/**
 * Read and parse `.npmrc` file with camelCase key conversion.
 *
 * This function reads an `.npmrc` INI-format file and parses it into an object.
 * All keys are automatically converted from kebab-case to camelCase for easier
 * JavaScript consumption (e.g., `allow-builds` → `allowBuilds`).
 *
 * @param path - Absolute path to the `.npmrc` file
 *
 * @returns A promise that resolves to the parsed `.npmrc` configuration object with camelCase keys
 *
 * @throws {Error} When file reading or INI parsing fails
 *
 * @example
 * ```ts
 * const config = await readNpmrc('/path/to/.npmrc')
 * // config.allowBuilds, config.packageExtensions, etc.
 * ```
 */
export async function readNpmrc(path: string): Promise<NpmRC> {
  const content = await readIniFile(path)
  return camelcaseKeys(content as NpmRC)
}
