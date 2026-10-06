import { isArray, isBoolean, isNumber, isString } from '@ntnyq/utils'
import {
  PNPM_V12_9_MINIMUM_VERSION,
  PNPM_V12_10_MINIMUM_VERSION,
  PNPM_V12_REGISTRY_DECLARATION_FIELDS,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

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
 *
 * @returns Whether a nested option is invalid for pnpm 12.9
 */
function hasInvalidRegistryOptionValue(field: string, value: unknown): boolean {
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
      return !isString(value) || !['npm', 'artifactory'].includes(value)
    case 'supportsTimeField':
      return !isBoolean(value)
    default:
      return true
  }
}

/**
 * Validate a registry declaration that opts into per-registry concurrency.
 *
 * @param declaration - Registry options containing networkConcurrency
 *
 * @returns Whether a nested option is invalid for pnpm 12.9
 */
function hasInvalidRegistryConcurrencyDeclaration(
  declaration: object,
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
    return hasInvalidRegistryOptionValue(field, value)
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
    if (
      !supportsV12_10 ||
      isArray(value) ||
      Object.keys(value).some(field => field !== 'includeResolutionSettings')
    ) {
      return true
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
  if (key === 'registries') {
    const entries: unknown[] = Object.values(value)
    return entries.some(entry => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !Object.hasOwn(entry, 'networkConcurrency')
      ) {
        return false
      }
      if (!supportsMinimumVersion(target.version, PNPM_V12_9_MINIMUM_VERSION)) {
        return true
      }
      return (
        entries.some(isString) ||
        hasInvalidRegistryConcurrencyDeclaration(entry)
      )
    })
  }
  return false
}
