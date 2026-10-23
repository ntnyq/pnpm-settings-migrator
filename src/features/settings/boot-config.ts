import {
  isArray,
  isBoolean,
  isNumber,
  isPlainObject,
  isString,
} from '@ntnyq/utils'
import {
  PNPM_V11_28_7_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'
import { parseIncludeSettings } from '../sources/includes/selectors'

/**
 * Check unsigned configuration integers without losing precision in JavaScript.
 *
 * @param value - Untrusted numeric setting
 *
 * @returns Whether the value is a nonnegative safe integer
 */
function isUnsignedInteger(value: unknown): boolean {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0
}

/**
 * Validate the strictly typed boot policy introduced in pnpm 12.15.
 *
 * @param value - Untrusted boot policy section
 *
 * @returns Whether a field or value falls outside the upstream schema
 */
function hasInvalidBootConfig(value: unknown): boolean {
  if (value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  return Object.entries(value).some(([field, entry]) => {
    switch (field) {
      case 'minimumReleaseAge':
      case 'trustPolicyIgnoreAfter':
        return entry !== null && !isUnsignedInteger(entry)
      case 'minimumReleaseAgeExclude':
      case 'trustPolicyExclude':
        return entry !== null && (!isArray(entry) || !entry.every(isString))
      case 'minimumReleaseAgeStrict':
      case 'minimumReleaseAgeIgnoreMissingTime':
        return entry !== null && !isBoolean(entry)
      case 'trustPolicy':
        return (
          entry !== null &&
          (!isString(entry) || !['off', 'no-downgrade'].includes(entry))
        )
      default:
        return true
    }
  })
}

/**
 * Validate catalog containers before partitioning their named ownership slots.
 *
 * @param key - Default or named catalog setting
 * @param value - Untrusted catalog container
 * @returns Whether a complete catalog value must remain in its source
 */
function hasInvalidCatalogs(key: string, value: unknown): boolean {
  if (value === null) {
    return false
  }
  if (!isPlainObject(value)) {
    return true
  }
  if (key === 'catalog') {
    return !Object.values(value).every(isString)
  }
  return Object.values(value).some(
    entry => !isPlainObject(entry) || !Object.values(entry).every(isString),
  )
}

/**
 * Check bootstrap policy, unpack limits, and unsupported include ownership.
 *
 * @param key - Canonical configuration key
 * @param value - Untrusted setting value
 * @param target - Confirmed target release
 *
 * @returns Whether the setting must remain intact in its source
 */
export function hasIncompatibleBootSetting(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (supportsMinimumVersion(target.version, PNPM_V11_28_7_MINIMUM_VERSION)) {
    if (key === 'autoInstallPeersFromHighestMatch') {
      return value !== null && !isBoolean(value)
    }
    if (key === 'externalDependencies') {
      return value !== null && (!isArray(value) || !value.every(isString))
    }
  }
  if (
    ['catalog', 'catalogs'].includes(key) &&
    supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION)
  ) {
    return hasInvalidCatalogs(key, value)
  }
  if (key === 'include') {
    if (!supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION)) {
      return true
    }
    try {
      parseIncludeSettings(value, target)
      return false
    } catch {
      return true
    }
  }
  if (key === 'bootConfig') {
    return (
      !supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION) ||
      hasInvalidBootConfig(value)
    )
  }
  if (key === 'maxTarballUnpackedSize') {
    return (
      (!supportsMinimumVersion(target.version, PNPM_V11_28_7_MINIMUM_VERSION) &&
        !supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION)) ||
      (value !== null && !isUnsignedInteger(value))
    )
  }
  return false
}
