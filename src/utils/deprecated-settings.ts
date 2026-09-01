import type { PnpmWorkspace } from '../types'

/**
 * Replace deprecated audit fields with the structured `audit` setting.
 *
 * @param settings - Workspace settings to normalize in place
 */
function normalizeAuditSettings(settings: PnpmWorkspace): void {
  const level = settings.audit?.level ?? settings.auditLevel
  const ignore = settings.audit?.ignore ?? settings.auditConfig?.ignoreGhsas

  if (level !== undefined || ignore !== undefined) {
    settings.audit = {
      ...settings.audit,
      ...(level === undefined ? {} : { level }),
      ...(ignore === undefined ? {} : { ignore }),
    }
  }

  Reflect.deleteProperty(settings, 'auditConfig')
  Reflect.deleteProperty(settings, 'auditLevel')
}

/**
 * Replace deprecated update fields with the structured `update` setting.
 *
 * @param settings - Workspace settings to normalize in place
 */
function normalizeUpdateSettings(settings: PnpmWorkspace): void {
  const { updateConfig } = settings
  if (!updateConfig) {
    return
  }

  settings.update = {
    ...(updateConfig.ignoreDependencies === undefined
      ? {}
      : { ignoreDeps: updateConfig.ignoreDependencies }),
    ...(updateConfig.changeset === undefined
      ? {}
      : { changeset: updateConfig.changeset }),
    ...(updateConfig.githubActions === undefined
      ? {}
      : { githubActions: updateConfig.githubActions }),
    ...(updateConfig.githubActionsServer === undefined
      ? {}
      : { githubActionsServer: updateConfig.githubActionsServer }),
    ...settings.update,
  }
  Reflect.deleteProperty(settings, 'updateConfig')
}

/**
 * Replace former scalar aliases with their canonical v11+ settings.
 *
 * @param settings - Workspace settings to normalize in place
 */
function normalizeScalarAliases(settings: PnpmWorkspace): void {
  if (settings.cleanupUnusedCatalogs !== undefined) {
    settings.catalogPrune ??= settings.cleanupUnusedCatalogs
    Reflect.deleteProperty(settings, 'cleanupUnusedCatalogs')
  }

  if (settings.enableGlobalVirtualStore !== undefined) {
    settings.virtualStoreType ??= settings.enableGlobalVirtualStore
      ? 'global'
      : 'project'
    Reflect.deleteProperty(settings, 'enableGlobalVirtualStore')
  }
}

/**
 * Replace the older side-effects cache spellings with one structured value.
 *
 * @param settings - Workspace settings to normalize in place
 */
function normalizeSideEffectsCache(settings: PnpmWorkspace): void {
  const declared = settings.sideEffectsCache
  const readonly = settings.sideEffectsCacheReadonly
  const remote = settings.remoteSideEffectsCache

  if (readonly === undefined && remote === undefined) {
    return
  }

  const structured =
    typeof declared === 'object' && declared !== null ? declared : undefined
  const shorthand = typeof declared === 'boolean' ? declared : undefined
  settings.sideEffectsCache = {
    ...(shorthand === undefined
      ? {}
      : {
          read: readonly === true ? true : shorthand,
          write: readonly === true ? false : shorthand,
        }),
    ...(readonly === undefined || shorthand !== undefined
      ? {}
      : {
          read: readonly,
          ...(readonly ? { write: false } : {}),
        }),
    ...(remote === undefined ? {} : { remote }),
    ...structured,
  }

  Reflect.deleteProperty(settings, 'remoteSideEffectsCache')
  Reflect.deleteProperty(settings, 'sideEffectsCacheReadonly')
}

interface RegistryDeclaration {
  prefix?: string
  scopes?: string[]
  [key: string]: unknown
}

function addRegistryScope(
  declarations: Record<string, RegistryDeclaration>,
  url: string,
  scope: string,
): void {
  declarations[url] ??= {}
  const declaration = declarations[url]
  declaration.scopes = [...new Set([...(declaration.scopes ?? []), scope])]
}

/**
 * Replace `namedRegistries` with URL-keyed registry declarations.
 *
 * A URL can expose only one canonical prefix. Conflicting legacy aliases are
 * therefore retained for manual resolution instead of being discarded.
 *
 * @param settings - Workspace settings to normalize in place
 * @param warnings - Collection that receives unresolved conflict warnings
 */
function normalizeNamedRegistries(
  settings: PnpmWorkspace,
  warnings: string[],
): void {
  const { namedRegistries } = settings
  if (!namedRegistries) {
    return
  }

  const prefixesByUrl = new Map<string, string[]>()
  for (const [prefix, url] of Object.entries(namedRegistries)) {
    const prefixes = prefixesByUrl.get(url) ?? []
    prefixes.push(prefix)
    prefixesByUrl.set(url, prefixes)
  }

  const conflicts = [...prefixesByUrl.entries()].filter(
    ([, prefixes]) => prefixes.length > 1,
  )
  if (conflicts.length) {
    warnings.push(
      `namedRegistries was kept because the new registries format supports one prefix per URL: ${conflicts
        .map(([url, prefixes]) => `${url} (${prefixes.join(', ')})`)
        .join('; ')}.`,
    )
    return
  }

  const declarations: Record<string, RegistryDeclaration> = {}
  for (const [key, value] of Object.entries(settings.registries ?? {})) {
    if (typeof value === 'string') {
      addRegistryScope(declarations, value, key === 'default' ? '@' : key)
    } else {
      declarations[key] = { ...value }
    }
  }

  for (const [url, [prefix]] of prefixesByUrl) {
    declarations[url] ??= {}
    const declaration = declarations[url]
    if (declaration.prefix && declaration.prefix !== prefix) {
      warnings.push(
        `namedRegistries was kept because ${url} already declares prefix ${declaration.prefix}.`,
      )
      return
    }
    declaration.prefix = prefix
  }

  settings.registries = declarations
  Reflect.deleteProperty(settings, 'namedRegistries')
}

/**
 * Replace aliases that remain accepted but are no longer canonical.
 *
 * @param settings - Workspace settings to normalize in place
 * @param warnings - Collection that receives unresolved conflict warnings
 *
 * @returns Nothing; settings and warnings are updated in place
 */
export function normalizeCurrentAliases(
  settings: PnpmWorkspace,
  warnings: string[],
): void {
  normalizeAuditSettings(settings)
  normalizeUpdateSettings(settings)
  normalizeScalarAliases(settings)
  normalizeSideEffectsCache(settings)
  normalizeNamedRegistries(settings, warnings)
}
