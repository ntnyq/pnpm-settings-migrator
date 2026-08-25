import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { kebabCase } from 'uncase'
import { PNPM_SETTINGS_FIELDS } from '../constants'
import type { CompatibilityTarget, NpmRC } from '../types'
import { fsReadFile, fsRemoveFile, fsWriteFile } from './fs'

/**
 * Authentication and registry keys that must remain in `.npmrc`.
 */
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

/**
 * Pattern for pnpm's channel-specific Node.js mirror keys.
 */
const NODE_MIRROR_KEY_PATTERN = /^node-mirror:(?<channel>.+)$/iu

/**
 * Migratable settings and their original `.npmrc` keys.
 */
export interface MigratableNpmrc {
  /**
   * Original keys of settings selected for migration.
   */
  keys: string[]

  /**
   * Parsed settings converted to camelCase keys.
   */
  settings: NpmRC
}

/**
 * Normalize `.npmrc` key for case-insensitive matching.
 *
 * @param key - Raw `.npmrc` key
 *
 * @returns Trimmed lower-case key without an array suffix
 */
function normalizeNpmrcKey(key: string): string {
  return key.trim().replace(/\[\]$/u, '').toLowerCase()
}

/**
 * Extract key name from a raw `.npmrc` line.
 *
 * @param line - Raw line from an `.npmrc` file
 *
 * @returns Normalized key, or `undefined` for comments and invalid lines
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
 *
 * @param key - Raw or normalized `.npmrc` key
 *
 * @returns `true` when the key must remain in `.npmrc`
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
 * This function reads the `.npmrc` file, removes lines whose exact normalized
 * keys were migrated, and writes the cleaned content back to the file.
 *
 * @param path - Absolute path to the `.npmrc` file
 * @param compatibility - Concrete pnpm compatibility target
 * @param migratedKeys - Original `.npmrc` keys that were migrated
 *
 * @returns A promise that resolves when the file has been pruned
 *
 * @throws {Error} When file read/write operations fail
 *
 * @example
 * ```ts
 * await pruneNpmrc('/path/to/.npmrc', 'v10', ['node-linker'])
 * ```
 */
export async function pruneNpmrc(
  path: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
  migratedKeys: string[],
): Promise<void> {
  const migratedKeySet = new Set(migratedKeys.map(normalizeNpmrcKey))
  const content = await fsReadFile(path)
  const lines = content.split(/\r?\n/u).filter(line => {
    const key = getNpmrcLineKey(line)
    if (!key) {
      return true
    }

    return !migratedKeySet.has(key)
  })

  const updatedContent = lines.join('\n').trimEnd()
  if (compatibility !== 'v10' && !updatedContent.trim()) {
    await fsRemoveFile(path)
    return
  }

  await fsWriteFile(path, updatedContent)
}

/**
 * Read `.npmrc` and return settings that should be migrated into workspace config.
 *
 * - `v10`: returns settings from the legacy whitelist.
 * - `v11+`: excludes auth/registry keys because pnpm still reads them from
 *   `.npmrc`.
 *
 * @param path - Absolute path to the `.npmrc` file
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Migratable settings and their original `.npmrc` keys
 *
 * @throws {Error} When file reading or INI parsing fails
 */
export async function readMigratableNpmrc(
  path: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): Promise<MigratableNpmrc> {
  const raw = (await readIniFile(path)) as NpmRC

  if (compatibility === 'v10') {
    const pnpmSettingsFields = new Set(
      PNPM_SETTINGS_FIELDS.map(field => normalizeNpmrcKey(kebabCase(field))),
    )
    const keys = Object.keys(raw).filter(key =>
      pnpmSettingsFields.has(normalizeNpmrcKey(key)),
    )
    const migratable = Object.fromEntries(keys.map(key => [key, raw[key]]))

    return {
      keys,
      settings: camelcaseKeys(migratable),
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
