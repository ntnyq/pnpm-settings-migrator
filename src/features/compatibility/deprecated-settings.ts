import { isBoolean, isString, unique } from '@ntnyq/utils'
import type { PnpmWorkspace, RegistryDeclaration } from '../../types'

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
 * @param canonicalSettings - Merged settings whose canonical section wins
 */
function normalizeUpdateSettings(
  settings: PnpmWorkspace,
  canonicalSettings: Pick<PnpmWorkspace, 'update'>,
): void {
  const { updateConfig } = settings
  if (!updateConfig) {
    return
  }

  if (
    canonicalSettings.update !== undefined &&
    canonicalSettings.update !== null
  ) {
    Reflect.deleteProperty(settings, 'updateConfig')
    return
  }

  settings.update ??= {
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
  const shorthand = isBoolean(declared) ? declared : undefined
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
          read: true,
          write: !readonly,
        }),
    ...(remote === undefined ? {} : { remote }),
    ...structured,
  }

  Reflect.deleteProperty(settings, 'remoteSideEffectsCache')
  Reflect.deleteProperty(settings, 'sideEffectsCacheReadonly')
}

/**
 * Add a scope to a registry URL without duplicating existing scope assignments.
 *
 * @param declarations - Registry declarations to update in place
 * @param url - Registry URL used as the declaration key
 * @param scope - Package scope, or `@` for the default registry
 *
 * @returns Nothing; the URL's declaration is created or updated in place
 */
function addRegistryScope(
  declarations: Record<string, RegistryDeclaration>,
  url: string,
  scope: string,
): void {
  declarations[url] ??= {}
  const declaration = declarations[url]
  declaration.scopes = unique([...(declaration.scopes ?? []), scope])
}

/**
 * Find source URLs with multiple active aliases across the merged settings.
 *
 * @param prefixesByUrl - Active aliases in the source being normalized
 * @param namedRegistries - Legacy aliases in the merged destination
 * @param canonicalPrefixes - Canonical prefixes that supersede legacy aliases
 *
 * @returns URLs and conflicting prefixes that require manual resolution
 */
function findRegistryAliasConflicts(
  prefixesByUrl: ReadonlyMap<string, readonly string[]>,
  namedRegistries: PnpmWorkspace['namedRegistries'],
  canonicalPrefixes: ReadonlySet<string>,
): [string, Set<string>][] {
  const allPrefixesByUrl = new Map(
    [...prefixesByUrl].map(([url, prefixes]) => [url, new Set(prefixes)]),
  )
  for (const [prefix, url] of Object.entries(namedRegistries ?? {})) {
    if (!canonicalPrefixes.has(prefix)) {
      allPrefixesByUrl.get(url)?.add(prefix)
    }
  }
  return [...allPrefixesByUrl.entries()].filter(
    ([, prefixes]) => prefixes.size > 1,
  )
}

/**
 * Replace `namedRegistries` with URL-keyed registry declarations.
 *
 * A URL can expose only one canonical prefix. Conflicting legacy aliases are
 * therefore retained for manual resolution instead of being discarded.
 *
 * @param settings - Workspace settings to normalize in place
 * @param warnings - Collection that receives unresolved conflict warnings
 * @param canonicalSettings - Merged registry declarations whose prefixes win
 */
function normalizeNamedRegistries(
  settings: PnpmWorkspace,
  warnings: string[],
  canonicalSettings: Pick<PnpmWorkspace, 'namedRegistries' | 'registries'>,
): void {
  const { namedRegistries } = settings
  if (!namedRegistries) {
    return
  }

  const declarations: Record<string, RegistryDeclaration> = {}
  for (const [key, value] of Object.entries(settings.registries ?? {})) {
    if (isString(value)) {
      addRegistryScope(declarations, value, key === 'default' ? '@' : key)
    } else {
      declarations[key] = { ...value }
    }
  }

  const canonicalPrefixes = new Set(
    Object.values(canonicalSettings.registries ?? {}).flatMap(value =>
      !isString(value) && isString(value?.prefix) ? [value.prefix] : [],
    ),
  )
  const prefixesByUrl = new Map<string, string[]>()
  // pnpm ignores legacy aliases already declared by the canonical setting.
  const registryAliases = Object.entries(namedRegistries).filter(
    ([prefix]) => !canonicalPrefixes.has(prefix),
  )
  for (const [prefix, url] of registryAliases) {
    const prefixes = prefixesByUrl.get(url) ?? []
    prefixes.push(prefix)
    prefixesByUrl.set(url, prefixes)
  }

  const conflicts = findRegistryAliasConflicts(
    prefixesByUrl,
    canonicalSettings.namedRegistries,
    canonicalPrefixes,
  )
  if (conflicts.length) {
    warnings.push(
      `namedRegistries was kept because the new registries format supports one prefix per URL: ${conflicts
        .map(([url, prefixes]) => `${url} (${[...prefixes].join(', ')})`)
        .join('; ')}.`,
    )
    return
  }

  for (const [url, [prefix]] of prefixesByUrl) {
    declarations[url] ??= {}
    const declaration = declarations[url]
    const canonicalDeclaration = canonicalSettings.registries?.[url]
    const declaredPrefix =
      (isString(canonicalDeclaration)
        ? undefined
        : canonicalDeclaration?.prefix) ?? declaration.prefix
    if (isString(declaredPrefix) && declaredPrefix !== prefix) {
      warnings.push(
        `namedRegistries was kept because ${url} already declares prefix ${declaredPrefix}.`,
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
 * @param canonicalSettings - Merged canonical sections used for alias precedence
 *
 * @returns Nothing; settings and warnings are updated in place
 */
export function normalizeCurrentAliases(
  settings: PnpmWorkspace,
  warnings: string[],
  canonicalSettings: Pick<
    PnpmWorkspace,
    'namedRegistries' | 'registries' | 'update'
  > = settings,
): void {
  normalizeAuditSettings(settings)
  normalizeUpdateSettings(settings, canonicalSettings)
  normalizeScalarAliases(settings)
  normalizeSideEffectsCache(settings)
  normalizeNamedRegistries(settings, warnings, canonicalSettings)
}
