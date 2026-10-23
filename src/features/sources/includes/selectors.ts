import { isArray, isPlainObject, isString } from '@ntnyq/utils'
import { PROJECT_REFUSED_SETTINGS } from '../../../constants'
import type {
  PnpmIncludeSettings,
  PnpmWorkspace,
  ResolvedPnpmTarget,
} from '../../../types'

/**
 * Reject the two mutually exclusive spellings of the default catalog.
 *
 * @param settings - Effective workspace before any destination is written
 * @returns Nothing when the default catalog has at most one definition
 */
export function assertSingleDefaultCatalog(settings: PnpmWorkspace): void {
  if (
    settings.catalog !== undefined &&
    settings.catalog !== null &&
    isPlainObject(settings.catalogs) &&
    Object.hasOwn(settings.catalogs, 'default')
  ) {
    throw new TypeError(
      'The default catalog must use either catalog or catalogs.default, but cannot define both.',
    )
  }
}

/**
 * Aliases sharing one setting owner in pnpm 12.15.
 */
const SETTING_ALIASES: Readonly<Record<string, string>> = {
  enableGlobalVirtualStore: 'virtualStoreType',
  nodeExperimentalPackageMap: 'nodePackageMap',
  nodePackageMapType: 'nodePackageMap',
  noproxy: 'noProxy',
  proxy: 'httpsProxy',
  permissions: 'allowBuilds',
  auditConfig: 'audit',
  auditLevel: 'audit',
  cleanupUnusedCatalogs: 'catalogPrune',
  maxsockets: 'maxSockets',
  namedRegistries: 'registries',
  updateConfig: 'update',
}

/**
 * Settings forbidden to config dependency owners by upstream.
 */
const PACKAGE_REFUSED_SETTINGS = new Set([
  'bootConfig',
  'cacheDir',
  'configDependencies',
  'globalBinDir',
  'globalDir',
  'globalPnpmfile',
  'globalVirtualStoreDir',
  'lockfileDir',
  'modulesDir',
  'npmrcAuthFile',
  'onlyBuiltDependenciesFile',
  'packages',
  'patchedDependencies',
  'patchesDir',
  'pnpmfile',
  'scriptShell',
  'stateDir',
  'storeDir',
  'virtualStoreDir',
])

/**
 * Resolve aliases and catalogs to pnpm's ownership slot spelling.
 *
 * @param key - Canonical setting or catalog selector
 *
 * @returns Slot identifier shared by equivalent spellings
 */
export function settingSlot(key: string): string {
  if (key === 'catalog') {
    return 'catalog:default'
  }
  if (key === 'catalogs') {
    return 'catalog:*'
  }
  if (key.startsWith('catalogs.')) {
    return `catalog:${key.slice('catalogs.'.length)}`
  }
  return `setting:${Object.hasOwn(SETTING_ALIASES, key) ? SETTING_ALIASES[key] : key}`
}

/**
 * Identify source spellings that pnpm treats as local YAML files.
 *
 * @param source - Include source key
 *
 * @returns Whether the declaration is a relative local path
 */
export function isLocalInclude(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../')
}

/**
 * Split a physical setting into ownership units without splitting nested values.
 *
 * @param key - Top-level settings key
 * @param value - Setting value, possibly a map of named catalogs
 *
 * @returns Slot/value pairs, excluding metadata and empty catalog containers
 */
export function settingEntries(
  key: string,
  value: unknown,
): [string, unknown][] {
  if (key === 'include' || key === '$schema') {
    return []
  }
  if (key === 'catalogs') {
    if (value === null) {
      return []
    }
    if (!isPlainObject(value)) {
      throw new TypeError('include requires catalogs to be a mapping or null.')
    }
    return Object.entries(value).map(([name, entry]) => [
      `catalog:${name}`,
      entry,
    ])
  }
  return [[settingSlot(key), value]]
}

/**
 * Check selector lists, canonical aliases, and package-specific restrictions.
 *
 * @param selectors - Untrusted explicit delegation list
 * @param target - Confirmed setting schema
 * @param local - Whether the owner is a local YAML file
 * @returns Nothing when all selector names and restrictions are valid
 */
function assertIncludeSelectors(
  selectors: unknown,
  target: ResolvedPnpmTarget,
  local: boolean,
): void {
  if (!isArray(selectors) || !selectors.every(isString)) {
    throw new TypeError(
      'include requires a setting list; only local YAML sources accept a wildcard.',
    )
  }
  const seen = new Set<string>()
  for (const selector of selectors) {
    const catalog =
      selector.startsWith('catalogs.') && selector.length > 'catalogs.'.length
    if (
      !selector ||
      selector === 'include' ||
      (!catalog && selector.includes('.')) ||
      (!catalog &&
        !target.workspaceSettings.has(selector) &&
        !PROJECT_REFUSED_SETTINGS.has(selector))
    ) {
      throw new TypeError(
        'include contains an unknown or invalid setting selector.',
      )
    }
    const slot = settingSlot(selector)
    if (seen.has(slot)) {
      throw new TypeError('include repeats a setting selector.')
    }
    if (!local && PACKAGE_REFUSED_SETTINGS.has(slot.slice('setting:'.length))) {
      throw new TypeError(
        'include delegates a repository-specific setting to a config dependency.',
      )
    }
    seen.add(slot)
  }
}

/**
 * Validate include syntax and delegated setting names before reading files.
 *
 * @param value - Untrusted include index
 * @param target - Target schema controlling recognized setting names
 *
 * @returns Validated index, retaining source order
 *
 * @throws {TypeError} When a source, selector, or package delegation is invalid
 */
export function parseIncludeSettings(
  value: unknown,
  target: ResolvedPnpmTarget,
): PnpmIncludeSettings {
  if (!isPlainObject(value)) {
    throw new TypeError(
      'include must be a mapping of sources to setting lists.',
    )
  }
  for (const [source, selectors] of Object.entries(value)) {
    const local = isLocalInclude(source)
    const validSource = local
      ? /\.(?:yaml|yml)$/u.test(source) && !/[*?[\]{}]/u.test(source)
      : /^(?:@[^/\\:]+\/)?[^./\\:][^/\\:]*$/u.test(source)
    if (!validSource) {
      throw new TypeError(
        'include sources must be relative YAML paths or config dependency names.',
      )
    }
    if (!(selectors === '*' && local)) {
      assertIncludeSelectors(selectors, target, local)
    }
  }
  return value as PnpmIncludeSettings
}
