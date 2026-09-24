import { isArray, isBoolean, isNumber, isString } from '@ntnyq/utils'
import {
  PNPM_V12_5_MINIMUM_VERSION,
  PNPM_V12_5_1_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Bounds of the signed 32-bit integer used by pnpm's task priority.
 */
const MIN_TASK_PRIORITY = -2_147_483_648
const MAX_TASK_PRIORITY = 2_147_483_647

/**
 * Validate scalar settings introduced or first consumed in pnpm 12.6.
 *
 * @param key - Canonical setting name
 * @param value - Untrusted source value
 * @param target - Target major whose scalar schema applies
 *
 * @returns Whether a scalar value cannot be read by the target
 */
function hasInvalidScalarValue(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (['autoDedupe', 'saveTypes'].includes(key)) {
    return !isBoolean(value)
  }
  if (target.compatibility === 'v12') {
    if (key === 'progress') {
      return !isBoolean(value)
    }
    if (key === 'tagVersionPrefix') {
      return !isString(value)
    }
    if (key === 'loglevel') {
      return (
        !isString(value) ||
        (!value.includes('${') &&
          !['silent', 'error', 'warn', 'info', 'debug'].includes(value))
      )
    }
  }
  return false
}

/**
 * Check value shapes that changed within a pnpm major release.
 *
 * Reject the whole setting so cleanup cannot discard unsupported nested values.
 *
 * @param key - Canonical workspace setting name
 * @param value - Incoming or existing setting value
 * @param target - Confirmed target version and major schema
 *
 * @returns Whether the value uses a shape unsupported by the selected release
 */
export function hasIncompatibleSettingValue(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (hasInvalidScalarValue(key, value, target)) {
    return true
  }
  const supportsV12_5 = supportsMinimumVersion(
    target.version,
    PNPM_V12_5_MINIMUM_VERSION,
  )
  if (key === 'supportedArchitectures' && isArray(value)) {
    return !supportsV12_5
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  if (key === 'tasks') {
    return Object.values(value).some(task => {
      if (
        !task ||
        typeof task !== 'object' ||
        !Object.hasOwn(task, 'priority')
      ) {
        return false
      }
      const priority: unknown = Reflect.get(task, 'priority')
      return (
        !isNumber(priority) ||
        !Number.isInteger(priority) ||
        priority < MIN_TASK_PRIORITY ||
        priority > MAX_TASK_PRIORITY
      )
    })
  }
  if (key === 'python' || key === 'cargo') {
    if (supportsV12_5 && Object.hasOwn(value, 'indexUrl')) {
      return true
    }
    if (key === 'python' && !supportsV12_5) {
      return ['versions', 'overrides', 'constraints'].some(field =>
        Object.hasOwn(value, field),
      )
    }
  }
  if (key === 'namedRegistries' && supportsV12_5) {
    return Object.keys(value).some(prefix => prefix.toLowerCase() === 'pkg')
  }
  if (key === 'registries') {
    return Object.values(value).some(entry => {
      if (!entry || typeof entry !== 'object') {
        return false
      }
      if (Object.hasOwn(entry, 'ecosystem') && !supportsV12_5) {
        return true
      }
      if (
        Object.hasOwn(entry, 'packages') &&
        !supportsMinimumVersion(target.version, PNPM_V12_5_1_MINIMUM_VERSION)
      ) {
        return true
      }
      const prefix: unknown = Reflect.get(entry, 'prefix')
      return supportsV12_5 && isString(prefix) && prefix.toLowerCase() === 'pkg'
    })
  }
  return false
}
