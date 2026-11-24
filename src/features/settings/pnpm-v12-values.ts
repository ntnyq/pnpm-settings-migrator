import { isArray, isBoolean, isPlainObject, isString } from '@ntnyq/utils'
import {
  PNPM_V12_10_MINIMUM_VERSION,
  PNPM_V12_13_MINIMUM_VERSION,
  PNPM_V12_14_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
  PNPM_V12_19_MINIMUM_VERSION,
  PNPM_V12_23_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'
import { hasIncompatibleBootSetting } from './boot-config'
import { hasInvalidReferenceTime } from './reference-time'
import { hasIncompatibleRegistryValue } from './registries'

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
 * Check linker objects without discarding unsupported options.
 *
 * @param value - Untrusted nodeLinker object
 * @param target - Exact release controlling available linker types
 *
 * @returns Whether the object cannot be read by the target
 */
function hasInvalidNodeLinkerOptions(
  value: object,
  target: ResolvedPnpmTarget,
): boolean {
  if (!isPlainObject(value)) {
    return true
  }
  const { type, ...options } = value
  if (type === 'loaded') {
    return Object.entries(options).some(
      ([key, entry]) =>
        key !== 'excluded' || !isArray(entry) || !entry.every(isString),
    )
  }
  if (!supportsMinimumVersion(target.version, PNPM_V12_23_MINIMUM_VERSION)) {
    return true
  }
  switch (type) {
    case 'isolated':
      return Object.entries(options).some(([key, entry]) => {
        if (key !== 'hoist') {
          return true
        }
        if (entry === null || isBoolean(entry)) {
          return false
        }
        return (
          !isPlainObject(entry) ||
          Object.entries(entry).some(
            ([scope, patterns]) =>
              !['private', 'public'].includes(scope) ||
              (patterns !== null &&
                (!isArray(patterns) || !patterns.every(isString))),
          )
        )
      })
    case 'hoisted':
      return Object.entries(options).some(
        ([key, entry]) =>
          key !== 'hoistingLimits' ||
          (entry !== null &&
            (!isString(entry) ||
              (!entry.includes('${') &&
                !['none', 'workspaces', 'dependencies'].includes(entry)))),
      )
    case 'pnp':
      return Object.entries(options).some(
        ([key, entry]) => key !== '_marker' || entry !== null,
      )
    default:
      return true
  }
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
 * Check new workspace scalars after the 12.23 capability is confirmed.
 *
 * @param key - Canonical setting name
 * @param value - Untrusted workspace value
 *
 * @returns Whether the workspace reader would reject the value
 */
function hasInvalidV12_23ScalarValue(key: string, value: unknown): boolean {
  if (value === null) {
    return false
  }
  switch (key) {
    case 'access':
      return !isString(value)
    case 'editor':
      return true
    case 'noProxy':
      return !isString(value) && !isBoolean(value)
    case 'referenceTime':
      return hasInvalidReferenceTime(value)
    case 'warnUnusedOverrides':
      return !isBoolean(value) && !(isString(value) && value.includes('${'))
    default:
      return false
  }
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
        !['includeResolutionSettings', 'integrityTarget', 'format'].includes(
          field,
        ),
    )
  ) {
    return true
  }
  if (Object.hasOwn(value, 'format')) {
    const format: unknown = Reflect.get(value, 'format')
    if (
      !supportsMinimumVersion(target.version, PNPM_V12_19_MINIMUM_VERSION) ||
      (format !== null &&
        (!isString(format) ||
          (!format.includes('${') && !['v9', 'v13'].includes(format))))
    ) {
      return true
    }
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
    hasIncompatiblePackageMapOrCache(key, value, target) ||
    (supportsMinimumVersion(target.version, PNPM_V12_23_MINIMUM_VERSION) &&
      hasInvalidV12_23ScalarValue(key, value))
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
  if (key === 'projectScopedOptionalPeers') {
    return value !== null && !isBoolean(value)
  }
  if (supportsV12_10 && hasInvalidLinkerOrLockfileScalarValue(key, value)) {
    return true
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  if (key === 'nodeLinker') {
    return !supportsV12_10 || hasInvalidNodeLinkerOptions(value, target)
  }
  if (key === 'lockfile') {
    return hasInvalidLockfileOptions(value, target)
  }
  if (key === 'registries') {
    return hasIncompatibleRegistryValue(value, target)
  }
  return false
}
