import {
  PNPM_V12_5_MINIMUM_VERSION,
  PNPM_V12_5_1_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

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
  const supportsV12_5 = supportsMinimumVersion(
    target.version,
    PNPM_V12_5_MINIMUM_VERSION,
  )
  if (key === 'supportedArchitectures' && Array.isArray(value)) {
    return !supportsV12_5
  }
  if (!value || typeof value !== 'object') {
    return false
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
      return (
        supportsV12_5 &&
        typeof prefix === 'string' &&
        prefix.toLowerCase() === 'pkg'
      )
    })
  }
  return false
}
