import camelcaseKeys from 'camelcase-keys'
import { readIniFile } from 'read-ini-file'
import { kebabCase } from 'uncase'
import {
  NPMRC_AUTH_OR_REGISTRY_KEYS,
  PNPM_V10_NPMRC_SETTINGS_FIELDS,
  NODE_MIRROR_KEY_PATTERN,
  PROXY_SETTINGS,
  NPMRC_STRING_ARRAY_SETTINGS,
} from '../../constants'
import type {
  SettingsIssues,
  CompatibilityTarget,
  ResolvedPnpmTarget,
  ReadMigratableNpmrcOptions,
  MigratableNpmrc,
  NpmRC,
} from '../../types'
import { fsReadFile, fsRemoveFile, fsWriteFile } from '../../utils/fs'
import { createSettingsIssues, selectPnpmSettings } from '../settings/schema'

/**
 * Append selection issues while optionally restoring original `.npmrc` keys.
 *
 * @param target - Issue collection to update in place
 * @param source - Issues returned by schema selection
 * @param sourceKeys - Original keys used in place of each nonempty source group
 *
 * @returns Nothing; issue keys are appended to the target collection
 */
function mergeSettingsIssues(
  target: SettingsIssues,
  source: SettingsIssues,
  sourceKeys?: string[],
): void {
  for (const reason of Object.keys(target) as (keyof SettingsIssues)[]) {
    if (source[reason].length) {
      target[reason].push(...(sourceKeys ?? source[reason]))
    }
  }
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
 * Convert scalar list settings to the array representation required by YAML.
 *
 * @param settings - Selected `.npmrc` settings with camelCase keys
 *
 * @returns Settings with each scalar list value preserved as one array item
 */
function normalizeNpmrcSettings(settings: NpmRC): NpmRC {
  for (const key of NPMRC_STRING_ARRAY_SETTINGS) {
    if (typeof settings[key] === 'string') {
      settings[key] = [settings[key]]
    }
  }
  return settings
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
 * root keys were migrated, and writes the cleaned content back to the file.
 * INI sections are retained because their child keys are not root settings.
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
  let inSection = false
  const lines = content.split(/\r?\n/u).filter(line => {
    // Match the section syntax used by the INI reader, including empty names.
    if (/^\[[^\]]*\]\s*$/u.test(line.replace(/^\uFEFF/u, ''))) {
      inSection = true
    }
    if (inSection) {
      return true
    }
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
 * - `v11+`: selects target-schema settings and retains auth, registry,
 *   refused, incompatible, and unknown keys.
 *
 * @param path - Absolute path to the `.npmrc` file
 * @param target - Resolved pnpm version and field capabilities
 * @param options - Optional destination-specific field restrictions
 *
 * @returns Migratable settings and their original `.npmrc` keys
 *
 * @throws {Error} When file reading or INI parsing fails
 */
export async function readMigratableNpmrc(
  path: string,
  target: ResolvedPnpmTarget,
  options: ReadMigratableNpmrcOptions = {},
): Promise<MigratableNpmrc> {
  const { compatibility } = target
  const raw = (await readIniFile(path)) as NpmRC
  const issues = createSettingsIssues()

  if (compatibility === 'v10') {
    const pnpmSettingsFields = new Set(
      PNPM_V10_NPMRC_SETTINGS_FIELDS.map(field =>
        normalizeNpmrcKey(kebabCase(field)),
      ),
    )
    const keys = Object.keys(raw).filter(key => {
      const canonicalKey = Object.keys(camelcaseKeys({ [key]: true }))[0] ?? key
      if (
        PROXY_SETTINGS.has(canonicalKey) &&
        typeof raw[key] === 'string' &&
        raw[key].includes('${')
      ) {
        issues.unsafe.push(key)
        return false
      }
      return pnpmSettingsFields.has(normalizeNpmrcKey(key))
    })
    const migratable = Object.fromEntries(keys.map(key => [key, raw[key]]))

    return {
      issues,
      keys,
      settings: normalizeNpmrcSettings(camelcaseKeys(migratable)),
    }
  }

  const migratable: NpmRC = {}
  const keys: string[] = []
  const nodeDownloadMirrors: Record<string, string> = {}
  const nodeDownloadMirrorKeys: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!isNpmrcAuthOrRegistryKey(key)) {
      const nodeMirrorMatch = normalizeNpmrcKey(key).match(
        NODE_MIRROR_KEY_PATTERN,
      )
      if (nodeMirrorMatch?.groups?.channel) {
        nodeDownloadMirrorKeys.push(key)
        nodeDownloadMirrors[nodeMirrorMatch.groups.channel] = String(value)
      } else {
        const selected = selectPnpmSettings({ [key]: value }, target, {
          allowedFields: options.allowedFields,
          npmrc: true,
        })
        keys.push(...selected.keys)
        Object.assign(migratable, selected.settings)
        mergeSettingsIssues(issues, selected.issues)
      }
    }
  }

  const settings = normalizeNpmrcSettings(camelcaseKeys(migratable))
  if (Object.keys(nodeDownloadMirrors).length) {
    const selected = selectPnpmSettings({ nodeDownloadMirrors }, target, {
      allowedFields: options.allowedFields,
    })
    if (selected.keys.length) {
      keys.push(...nodeDownloadMirrorKeys)
      settings.nodeDownloadMirrors = nodeDownloadMirrors
    } else {
      mergeSettingsIssues(issues, selected.issues, nodeDownloadMirrorKeys)
    }
  }

  return {
    issues,
    keys,
    settings,
  }
}
