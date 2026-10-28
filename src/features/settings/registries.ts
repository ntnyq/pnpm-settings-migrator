import {
  isArray,
  isBoolean,
  isNumber,
  isPlainObject,
  isString,
} from '@ntnyq/utils'
import {
  PNPM_V12_9_MINIMUM_VERSION,
  PNPM_V12_11_1_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
  PNPM_V11_28_9_MINIMUM_VERSION,
  PNPM_V12_REGISTRY_DECLARATION_FIELDS,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Check that a registry location is a URL rather than an object property name.
 *
 * @param value - Untrusted registry location
 *
 * @returns Whether the location is an absolute or scheme-relative URL
 */
function isRegistryUrl(value: unknown): boolean {
  return (
    isString(value) &&
    URL.canParse(value.startsWith('//') ? `https:${value}` : value)
  )
}

/**
 * Normalize a registry only for comparing scope routes, as the target does.
 * Prefix uniqueness deliberately uses the original declarations instead.
 *
 * @param registry - Registry URL already checked for valid syntax
 * @param target - Confirmed target controlling URL normalization
 *
 * @returns Registry identity used by the target's scope lookup
 */
function normalizeScopeRegistry(
  registry: string,
  target: ResolvedPnpmTarget,
): string {
  let normalized = registry
  if (target.compatibility === 'v11' && URL.canParse(registry)) {
    normalized = new URL(registry).toString()
  } else if (
    supportsMinimumVersion(target.version, PNPM_V12_11_1_MINIMUM_VERSION)
  ) {
    normalized = registry.replace(
      /^(?<protocol>https:\/\/|\/\/)registry\.npmjs\.com\/?$/u,
      '$<protocol>registry.npmjs.org/',
    )
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

/**
 * Detect duplicate prefixes and scope routes pointing at different registries.
 * Called during source selection and final workspace validation before writes.
 *
 * @param key - Canonical setting name
 * @param value - Untrusted registry map
 * @param target - Release whose declaration routing rules apply
 *
 * @returns Whether declarations conflict with another route in the same map
 */
export function hasConflictingRegistryRoutes(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (
    key !== 'registries' ||
    target.compatibility === 'v10' ||
    !isPlainObject(value)
  ) {
    return false
  }
  const prefixes = new Set<string>()
  const scopes = new Map<string, string>()
  return Object.entries(value).some(([registry, declaration]) => {
    if (!isPlainObject(declaration)) {
      return false
    }
    const { prefix } = declaration
    if (isString(prefix)) {
      if (prefixes.has(prefix)) {
        return true
      }
      prefixes.add(prefix)
    }
    if (!isArray(declaration.scopes)) {
      return false
    }
    const normalized = normalizeScopeRegistry(registry, target)
    return declaration.scopes.filter(isString).some(scope => {
      const existing = scopes.get(scope)
      if (existing !== undefined && existing !== normalized) {
        return true
      }
      scopes.set(scope, normalized)
      return false
    })
  })
}

/**
 * Validate locations in legacy registry maps and URL-keyed declarations.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted registry configuration
 *
 * @returns Whether the complete setting must be retained in its source
 */
export function hasInvalidRegistryLocations(
  key: string,
  value: unknown,
): boolean {
  if (!['namedRegistries', 'registries'].includes(key) || value === null) {
    return false
  }
  if (!isPlainObject(value)) {
    return true
  }
  if (key === 'namedRegistries') {
    return Object.values(value).some(url => !isRegistryUrl(url))
  }
  return Object.entries(value).some(([url, entry]) =>
    isString(entry) ? !isRegistryUrl(entry) : !isRegistryUrl(url),
  )
}

/**
 * Check the declared type of a non-null registry option.
 *
 * @param field - Registry declaration field name
 * @param value - Untrusted option value
 * @param target - Release controlling registry server types
 *
 * @returns Whether a nested option is invalid for pnpm 12.9
 */
function hasInvalidRegistryOptionValue(
  field: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  switch (field) {
    case 'networkConcurrency':
      return !isNumber(value) || !Number.isSafeInteger(value) || value <= 0
    case 'ecosystem':
      return !isString(value) || !['npm', 'cargo', 'pypi'].includes(value)
    case 'packages':
      return !isArray(value) || !value.every(isString)
    case 'scopes':
      return (
        !isArray(value) ||
        value.some(scope => !isString(scope) || !scope.startsWith('@'))
      )
    case 'prefix':
      return !isString(value)
    case 'serverType':
      return (
        !isString(value) ||
        ![
          'npm',
          'artifactory',
          ...(supportsMinimumVersion(
            target.version,
            PNPM_V12_15_MINIMUM_VERSION,
          ) ||
          supportsMinimumVersion(target.version, PNPM_V11_28_9_MINIMUM_VERSION)
            ? ['pnpr']
            : []),
        ].includes(value)
      )
    case 'supportsTimeField':
      return !isBoolean(value)
    default:
      return true
  }
}

/**
 * Validate every field in a registry declaration for the selected release.
 *
 * @param declaration - Registry options with or without versioned fields
 * @param target - Release controlling registry server types
 *
 * @returns Whether a nested option is unknown or invalid for the target
 */
function hasInvalidRegistryDeclaration(
  declaration: object,
  target: ResolvedPnpmTarget,
): boolean {
  const ecosystem: unknown = Reflect.get(declaration, 'ecosystem') ?? 'npm'
  return Object.entries(declaration).some(([field, value]) => {
    if (!PNPM_V12_REGISTRY_DECLARATION_FIELDS.includes(field)) {
      return true
    }
    if (value === null) {
      return false
    }
    if (field === 'packages' && ecosystem !== 'pypi') {
      return true
    }
    if (
      ['scopes', 'prefix', 'serverType', 'supportsTimeField'].includes(field) &&
      ecosystem !== 'npm'
    ) {
      return true
    }
    return hasInvalidRegistryOptionValue(field, value, target)
  })
}

/**
 * Validate registry representation before release-specific declaration fields.
 * Pure legacy scope maps must use scope keys rather than registry URLs.
 *
 * @param value - Registry map already checked for valid locations
 * @param target - Release controlling declaration fields and enum values
 *
 * @returns Whether any entry prevents migration of the complete map
 */
export function hasIncompatibleRegistryValue(
  value: object,
  target: ResolvedPnpmTarget,
): boolean {
  const entries: unknown[] = Object.values(value)
  if (entries.every(isString)) {
    return Object.keys(value).some(
      key => key.includes('://') || key.startsWith('//'),
    )
  }
  if (!entries.every(isPlainObject)) {
    return true
  }
  return entries.some(
    entry =>
      (Object.hasOwn(entry, 'networkConcurrency') &&
        !supportsMinimumVersion(target.version, PNPM_V12_9_MINIMUM_VERSION)) ||
      hasInvalidRegistryDeclaration(entry, target),
  )
}
