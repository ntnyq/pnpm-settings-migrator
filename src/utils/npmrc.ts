import { pick } from '@ntnyq/utils'
import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { kebabCase } from 'uncase'
import { PNPM_SETTINGS_FIELDS } from '../constants'
import type { CompatibilityTarget, NpmRC } from '../types'
import { fsReadFile, fsRemoveFile, fsWriteFile } from './fs'

const NPMRC_AUTH_OR_REGISTRY_KEYS: string[] = [
  '_auth',
  '_authtoken',
  '_password',
  'always-auth',
  'ca',
  'cafile',
  'cert',
  'certfile',
  'email',
  'key',
  'keyfile',
  'otp',
  'tokenhelper',
  'username',
]

const NODE_MIRROR_KEY_PATTERN = /^node-mirror:(?<channel>.+)$/iu

/**
 * Normalize `.npmrc` key for case-insensitive matching.
 */
function normalizeNpmrcKey(key: string): string {
  return key.trim().replace(/\[\]$/u, '').toLowerCase()
}

/**
 * Extract key name from a raw `.npmrc` line.
 */
function getNpmrcLineKey(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
    return undefined
  }

  const index = trimmed.indexOf('=')
  if (index <= 0) {
    return undefined
  }

  return normalizeNpmrcKey(trimmed.slice(0, index))
}

/**
 * Check whether a `.npmrc` key is auth/registry-related and should stay in
 * pnpm v11 and newer.
 */
function isNpmrcAuthOrRegistryKey(key: string): boolean {
  const normalized = normalizeNpmrcKey(key)

  if (normalized.startsWith('//')) {
    return true
  }

  if (normalized === 'registry' || normalized.endsWith(':registry')) {
    return true
  }

  return NPMRC_AUTH_OR_REGISTRY_KEYS.some(
    authKey => normalized === authKey || normalized.endsWith(`:${authKey}`),
  )
}

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
export async function pruneNpmrc(
  path: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'> = 'v10',
  migratedKeys: string[] = [],
): Promise<void> {
  const pnpmSettingsFields = PNPM_SETTINGS_FIELDS.map(field => kebabCase(field))
  const migratedKeySet = new Set(migratedKeys.map(normalizeNpmrcKey))
  const content = await fsReadFile(path)
  const lines = content.split(/\r?\n/u).filter(line => {
    const key = getNpmrcLineKey(line)
    if (!key) {
      return true
    }

    if (compatibility !== 'v10') {
      // In v11+ mode only remove lines that were actually migrated.
      return !migratedKeySet.has(normalizeNpmrcKey(key))
    }

    return !pnpmSettingsFields.some(field => key.startsWith(field))
  })

  const updatedContent = lines.join('\n').trimEnd()
  if (compatibility !== 'v10' && !updatedContent.trim()) {
    await fsRemoveFile(path)
    return
  }

  await fsWriteFile(path, updatedContent)
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
/**
 * Read `.npmrc` and return settings that should be migrated into workspace config.
 *
 * - `v10`: returns settings from the legacy whitelist.
 * - `v11+`: excludes auth/registry keys because pnpm still reads them from
 *   `.npmrc`.
 */
export async function readMigratableNpmrc(
  path: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): Promise<{ keys: string[]; settings: NpmRC }> {
  const raw = (await readIniFile(path)) as NpmRC

  if (compatibility === 'v10') {
    const settings = camelcaseKeys(raw)

    return {
      keys: PNPM_SETTINGS_FIELDS,
      settings: pick(settings, PNPM_SETTINGS_FIELDS),
    }
  }

  const migratable: NpmRC = {}
  const keys: string[] = []
  const nodeDownloadMirrors: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isNpmrcAuthOrRegistryKey(key)) {
      keys.push(key)

      const nodeMirrorMatch = normalizeNpmrcKey(key).match(
        NODE_MIRROR_KEY_PATTERN,
      )
      if (nodeMirrorMatch?.groups?.channel) {
        nodeDownloadMirrors[nodeMirrorMatch.groups.channel] = String(value)
      } else {
        migratable[key] = value
      }
    }
  }

  const settings = camelcaseKeys(migratable)
  if (Object.keys(nodeDownloadMirrors).length) {
    settings.nodeDownloadMirrors = nodeDownloadMirrors
  }

  return {
    keys,
    settings,
  }
}

export async function readNpmrc(path: string): Promise<NpmRC> {
  return camelcaseKeys((await readIniFile(path)) as NpmRC)
}
