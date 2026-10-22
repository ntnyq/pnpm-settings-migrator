import { isArray, isPlainObject, isString } from '@ntnyq/utils'
import { relative, resolve } from 'pathe'
import type { PnpmWorkspace } from '../../../types'

/**
 * Settings whose scalar paths are measured from the owning YAML directory.
 */
const PATH_SETTINGS = new Set([
  'cacheDir',
  'globalBinDir',
  'globalDir',
  'globalPnpmfile',
  'globalVirtualStoreDir',
  'lockfileDir',
  'modulesDir',
  'npmrcAuthFile',
  'onlyBuiltDependenciesFile',
  'patchesDir',
  'stateDir',
  'storeDir',
  'virtualStoreDir',
])

/**
 * Express one relative path from another configuration directory.
 *
 * @param value - Path spelling to retain when it is not relative
 * @param from - Directory the path currently refers to
 * @param to - Directory the result will refer to
 *
 * @returns Rebased path, preserving absolute, home, and environment spellings
 */
function rebasePath(value: string, from: string, to: string): string {
  if (!value || /^[\\/~$]|^[a-z]:/iu.test(value)) {
    return value
  }
  const result = relative(to, resolve(from, value.replaceAll('\\', '/'))) || '.'
  return /^\.[/\\]/u.test(value) && !result.startsWith('.')
    ? `./${result}`
    : result
}

/**
 * Rebase local dependency specifiers without touching version selectors.
 *
 * @param value - Version, URL, or local dependency specifier
 * @param options - Coordinate directories and workspace protocol support
 * @param options.from - Source configuration directory
 * @param options.to - Destination configuration directory
 * @param options.workspace - Whether workspace paths are meaningful in this setting
 *
 * @returns Specifier using the destination file's coordinate system
 */
function rebaseSpecifier(
  value: string,
  options: { from: string; to: string; workspace?: boolean },
): string {
  const { from, to, workspace = false } = options
  const forward = value.replaceAll('\\', '/')
  const prefix =
    forward.match(/^(?:file:|link:)/u)?.[0] ??
    (workspace && forward.startsWith('workspace:.') ? 'workspace:' : '')
  if (!prefix && !/^(?:[./]|~\/)/u.test(forward)) {
    return value
  }
  let path = forward.slice(prefix.length)
  if (prefix) {
    const trimmed = path.replace(/^\/+/u, '')
    if (/^[a-z]:/iu.test(trimmed) || /^[~.]/u.test(trimmed)) {
      path = trimmed
    } else if (path.startsWith('/')) {
      path = `/${trimmed}`
    }
  }
  const rebased = /^(?:\/|~\/|[a-z]:)/iu.test(path)
    ? path
    : relative(to, resolve(from, path)) || '.'
  // Bare and workspace specifiers must still select the local-path resolver.
  const local =
    (!prefix || prefix === 'workspace:') && !/^[./~]/u.test(rebased)
      ? `./${rebased}`
      : rebased
  return `${prefix}${local}`
}

/**
 * Rewrite each string value while preserving all non-string values intact.
 *
 * @param value - Untrusted scalar or string array
 * @param rewrite - Path or specifier transformation
 *
 * @returns Value with its string elements rebased
 */
function mapStrings(
  value: unknown,
  rewrite: (entry: string) => string,
): unknown {
  if (isArray(value)) {
    return value.map(entry => (isString(entry) ? rewrite(entry) : entry))
  }
  return isString(value) ? rewrite(value) : value
}

/**
 * Rebase mapping values without traversing arbitrary nested configuration.
 *
 * @param value - Potential map
 * @param rewrite - Value transformation for this setting
 *
 * @returns Rewritten mapping, or the original non-map value
 */
function mapValues(
  value: unknown,
  rewrite: (entry: unknown) => unknown,
): unknown {
  return isPlainObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]),
      )
    : value
}

/**
 * Convert the path-bearing settings pnpm rebases in local includes.
 *
 * @param settings - Settings expressed relative to their current owner
 * @param from - Current owner's directory
 * @param to - New coordinate directory
 *
 * @returns Independent settings object with equivalent filesystem locations
 */
export function rebaseIncludedSettings(
  settings: PnpmWorkspace,
  from: string,
  to: string,
): PnpmWorkspace {
  if (resolve(from) === resolve(to)) {
    return structuredClone(settings)
  }
  const path = (entry: string) => rebasePath(entry, from, to)
  const specifier = (entry: unknown) =>
    isString(entry) ? rebaseSpecifier(entry, { from, to }) : entry
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => {
      let result: unknown = structuredClone(value)
      if (PATH_SETTINGS.has(key) || key === 'pnpmfile') {
        result = mapStrings(value, path)
      } else if (key === 'packages') {
        result = mapStrings(value, entry =>
          entry.startsWith('!') ? `!${path(entry.slice(1))}` : path(entry),
        )
      } else if (key === 'scriptShell') {
        result = mapStrings(value, entry =>
          /[/\\]/u.test(entry) ? path(entry) : entry,
        )
      } else if (key === 'patchedDependencies') {
        result = mapValues(value, entry => mapStrings(entry, path))
      } else if (key === 'catalog') {
        result = mapValues(value, specifier)
      } else if (key === 'catalogs') {
        result = mapValues(value, entry => mapValues(entry, specifier))
      } else if (key === 'overrides') {
        result = mapValues(value, entry =>
          isString(entry)
            ? rebaseSpecifier(entry, { from, to, workspace: true })
            : entry,
        )
      }
      return [key, result]
    }),
  ) as PnpmWorkspace
}
