import { isArray, isBoolean, isPlainObject, isString } from '@ntnyq/utils'
import {
  PNPM_V11_28_3_MINIMUM_VERSION,
  PNPM_V11_28_4_MINIMUM_VERSION,
  PNPM_V11_28_5_MINIMUM_VERSION,
  PNPM_V11_28_6_MINIMUM_VERSION,
  PNPM_V11_29_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Check workspace values newly validated by pnpm 11.29.
 *
 * @param key - Canonical workspace setting
 * @param value - Untrusted workspace value
 *
 * @returns Whether the new reader rejects the setting
 */
function hasInvalidV11_29Value(key: string, value: unknown): boolean {
  switch (key) {
    case 'localAddress':
      return !isString(value)
    case 'noProxy':
      return !isString(value) && !isBoolean(value)
    case 'strictSsl':
      return !isBoolean(value)
    case 'tasks':
      return isPlainObject(value) && Object.values(value).includes(null)
    case 'minimumReleaseAge': {
      if (isString(value) && value.includes('${')) {
        return false
      }
      const minutes = isString(value) ? Number(value) : value
      return (
        typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0
      )
    }
    default:
      return false
  }
}

/**
 * Validate values newly checked by pnpm v11 releases.
 *
 * @param key - Canonical setting or legacy alias that will be normalized
 * @param value - Untrusted source value
 * @param target - Confirmed target version
 *
 * @returns Whether pnpm rejects the value after migration
 */
export function hasIncompatibleV11SettingValue(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (
    ['httpProxy', 'httpsProxy'].includes(key) &&
    supportsMinimumVersion(target.version, PNPM_V11_28_5_MINIMUM_VERSION)
  ) {
    if (
      value === null &&
      supportsMinimumVersion(target.version, PNPM_V11_28_6_MINIMUM_VERSION)
    ) {
      return false
    }
    return !isString(value)
  }
  if (value === null || value === undefined) {
    return false
  }
  if (
    key === 'allowBuilds' &&
    supportsMinimumVersion(target.version, PNPM_V11_28_3_MINIMUM_VERSION)
  ) {
    return (
      typeof value !== 'object' ||
      isArray(value) ||
      Object.values(value).some(entry => !isBoolean(entry) && !isString(entry))
    )
  }
  if (supportsMinimumVersion(target.version, PNPM_V11_28_4_MINIMUM_VERSION)) {
    if (['allowUnusedPatches', 'allowNonAppliedPatches'].includes(key)) {
      return !isBoolean(value)
    }
    if (['ignoredOptionalDependencies', 'requiredScripts'].includes(key)) {
      return !isArray(value) || !value.every(isString)
    }
  }
  return (
    supportsMinimumVersion(target.version, PNPM_V11_29_MINIMUM_VERSION) &&
    hasInvalidV11_29Value(key, value)
  )
}
