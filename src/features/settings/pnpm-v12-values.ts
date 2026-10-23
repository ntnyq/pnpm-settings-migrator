import { isArray, isBoolean, isNumber, isString } from '@ntnyq/utils'
import {
  PNPM_V12_9_MINIMUM_VERSION,
  PNPM_V12_10_MINIMUM_VERSION,
  PNPM_V12_13_MINIMUM_VERSION,
  PNPM_V12_14_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
  PNPM_V12_REGISTRY_DECLARATION_FIELDS,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'
import { hasIncompatibleBootSetting } from './boot-config'

/**
 * Validate the package-map section without dropping future or misspelled keys.
 *
 * @param value - Untrusted package-map value
 *
 * @returns Whether the section is outside the pnpm 12.13 schema
 */
function hasInvalidNodePackageMap(value: unknown): boolean {
  if (value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  return Object.entries(value).some(([field, entry]) => {
    let values: string[] = []
    if (field === 'mode') {
      values = ['off', 'write-only', 'load']
    } else if (field === 'type') {
      values = ['standard', 'loose']
    }
    return (
      values.length === 0 ||
      (entry !== null &&
        (!isString(entry) ||
          (!entry.includes('${') && !values.includes(entry))))
    )
  })
}

/**
 * Validate cache exclusions and retain their whole section on older targets.
 *
 * @param value - Untrusted cache section
 * @param target - Confirmed release controlling exclusion support
 *
 * @returns Whether a section containing exclusions cannot migrate
 */
function hasInvalidCacheExclusions(
  value: object,
  target: ResolvedPnpmTarget,
): boolean {
  if (!Object.hasOwn(value, 'exclude')) {
    return false
  }
  if (!supportsMinimumVersion(target.version, PNPM_V12_14_MINIMUM_VERSION)) {
    return true
  }
  return Object.entries(value).some(([field, entry]) => {
    if (field === 'exclude') {
      return entry !== null && (!isArray(entry) || !entry.every(isString))
    }
    if (field === 'read' || field === 'write') {
      return (
        entry !== null &&
        !isBoolean(entry) &&
        !(isString(entry) && entry.includes('${'))
      )
    }
    if (field !== 'remote') {
      return true
    }
    if (entry === null) {
      return false
    }
    if (!entry || typeof entry !== 'object' || isArray(entry)) {
      return true
    }
    return Object.entries(entry).some(([key, setting]) => {
      if (key === 'org' || key === 'organization') {
        return !isString(setting)
      }
      return key !== 'packages' || !isArray(setting) || !setting.every(isString)
    })
  })
}

/**
 * Check the value expansions introduced by pnpm 12.13 and 12.14.
 *
 * @param key - Canonical setting name
 * @param value - Untrusted setting value
 * @param target - Confirmed target release
 *
 * @returns Whether a package-map, store-index, or cache value is incompatible
 */
function hasIncompatiblePackageMapOrCache(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (key === 'nodePackageMap') {
    return (
      !supportsMinimumVersion(target.version, PNPM_V12_13_MINIMUM_VERSION) ||
      hasInvalidNodePackageMap(value)
    )
  }
  if (key === 'storeIndexFormat') {
    return (
      !supportsMinimumVersion(target.version, PNPM_V12_13_MINIMUM_VERSION) ||
      (value !== null &&
        (!isString(value) ||
          (!value.includes('${') && !['sqlite', 'files'].includes(value))))
    )
  }
  if (key === 'sideEffectsCache' && value && typeof value === 'object') {
    return hasInvalidCacheExclusions(value, target)
  }
  return false
}

/**
 * Check a loaded linker object without discarding unsupported options.
 *
 * @param value - Untrusted nodeLinker object
 *
 * @returns Whether the object cannot be read by pnpm 12.10
 */
function hasInvalidNodeLinkerOptions(value: object): boolean {
  if (isArray(value) || Reflect.get(value, 'type') !== 'loaded') {
    return true
  }
  if (Object.keys(value).some(key => !['type', 'excluded'].includes(key))) {
    return true
  }
  const excluded: unknown = Reflect.get(value, 'excluded')
  return (
    Object.hasOwn(value, 'excluded') &&
    (!isArray(excluded) || !excluded.every(isString))
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
          )
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
 * Validate a registry declaration that opts into per-registry concurrency.
 *
 * @param declaration - Registry options containing versioned fields
 * @param target - Release controlling registry server types
 *
 * @returns Whether a nested option is invalid for pnpm 12.9
 */
function hasInvalidRegistryConcurrencyDeclaration(
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
 * Validate scalar alternatives of the pnpm 12.10 linker and lockfile unions.
 *
 * @param key - Canonical setting name
 * @param value - Untrusted source value
 *
 * @returns Whether a non-object value falls outside the supported alternatives
 */
function hasInvalidLinkerOrLockfileScalarValue(
  key: string,
  value: unknown,
): boolean {
  if (value === null || typeof value === 'object') {
    return false
  }
  if (key === 'nodeLinker') {
    return (
      !isString(value) ||
      (!value.includes('${') &&
        !['isolated', 'hoisted', 'pnp', 'loaded'].includes(value))
    )
  }
  return key === 'lockfile' && !isBoolean(value)
}

/**
 * Check lockfile options against their exact introduction releases.
 *
 * @param value - Untrusted object form of the lockfile setting
 * @param target - Confirmed target release
 *
 * @returns Whether the entire section must remain in its source
 */
function hasInvalidLockfileOptions(
  value: object,
  target: ResolvedPnpmTarget,
): boolean {
  if (
    !supportsMinimumVersion(target.version, PNPM_V12_10_MINIMUM_VERSION) ||
    isArray(value) ||
    Object.keys(value).some(
      field =>
        !['includeResolutionSettings', 'integrityTarget'].includes(field),
    )
  ) {
    return true
  }
  if (Object.hasOwn(value, 'integrityTarget')) {
    const integrityTarget: unknown = Reflect.get(value, 'integrityTarget')
    if (
      !supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION) ||
      (integrityTarget !== null &&
        (!isString(integrityTarget) ||
          (!integrityTarget.includes('${') &&
            !['resource', 'tar'].includes(integrityTarget))))
    ) {
      return true
    }
  }
  const includeResolutionSettings: unknown = Reflect.get(
    value,
    'includeResolutionSettings',
  )
  return (
    Object.hasOwn(value, 'includeResolutionSettings') &&
    includeResolutionSettings !== null &&
    !isBoolean(includeResolutionSettings)
  )
}

/**
 * Validate settings whose accepted shapes expanded in pnpm 12.9 and 12.10.
 *
 * Reject an entire setting when a nested value is unsupported so source cleanup
 * preserves the original configuration.
 *
 * @param key - Canonical workspace setting name
 * @param value - Incoming or existing setting value
 * @param target - Confirmed target version and major schema
 *
 * @returns Whether the setting cannot be used by the target release
 */
export function hasIncompatibleV12SettingValue(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (
    hasIncompatibleBootSetting(key, value, target) ||
    hasIncompatiblePackageMapOrCache(key, value, target)
  ) {
    return true
  }
  const supportsV12_10 = supportsMinimumVersion(
    target.version,
    PNPM_V12_10_MINIMUM_VERSION,
  )
  if (key === 'nodeLinker' && value === 'loaded') {
    return !supportsV12_10
  }
  if (key === 'failIfNoMatch' && target.compatibility === 'v12') {
    return value !== null && !isBoolean(value)
  }
  if (supportsV12_10 && hasInvalidLinkerOrLockfileScalarValue(key, value)) {
    return true
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  if (key === 'nodeLinker') {
    return !supportsV12_10 || hasInvalidNodeLinkerOptions(value)
  }
  if (key === 'lockfile') {
    return hasInvalidLockfileOptions(value, target)
  }
  if (key === 'registries') {
    const entries: unknown[] = Object.values(value)
    return entries.some(entry => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        (!Object.hasOwn(entry, 'networkConcurrency') &&
          !(
            Object.hasOwn(entry, 'serverType') &&
            (Reflect.get(entry, 'serverType') === 'pnpr' ||
              supportsMinimumVersion(
                target.version,
                PNPM_V12_15_MINIMUM_VERSION,
              ))
          ))
      ) {
        return false
      }
      if (
        Object.hasOwn(entry, 'networkConcurrency') &&
        !supportsMinimumVersion(target.version, PNPM_V12_9_MINIMUM_VERSION)
      ) {
        return true
      }
      return (
        entries.some(isString) ||
        hasInvalidRegistryConcurrencyDeclaration(entry, target)
      )
    })
  }
  return false
}
