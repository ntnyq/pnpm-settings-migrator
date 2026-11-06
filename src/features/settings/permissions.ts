import { isArray, isBoolean, isString } from '@ntnyq/utils'
import { PNPM_V12_18_MINIMUM_VERSION } from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Validate a dependency's capability map without dropping unknown permissions.
 *
 * @param value - Untrusted per-package permission entry
 * @param target - Confirmed target version for skill decision shapes
 *
 * @returns Whether pnpm cannot consume every capability in the entry
 */
function hasInvalidPackagePermissions(
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  const supportsChosenSkills = supportsMinimumVersion(
    target.version,
    PNPM_V12_18_MINIMUM_VERSION,
  )
  if (value === null) {
    return supportsChosenSkills
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  return Object.entries(value).some(([capability, decision]) => {
    if (!['build', 'skills'].includes(capability)) {
      return true
    }
    if (decision === null || isBoolean(decision)) {
      return false
    }
    if (capability === 'skills' && supportsChosenSkills) {
      return !isArray(decision) || !decision.every(isString)
    }
    return !isString(decision)
  })
}

/**
 * Validate permissions and skill directories introduced in pnpm 12.11.
 * Preserve an entire object when a nested value is invalid or ignored upstream.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted source or existing workspace value
 * @param target - Confirmed target version for skill decision shapes
 *
 * @returns Whether the setting contains unsupported nested values
 */
export function hasInvalidPermissionSettings(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (!['permissions', 'skills'].includes(key) || value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  if (key === 'permissions') {
    return Object.values(value).some(entry =>
      hasInvalidPackagePermissions(entry, target),
    )
  }
  if (Object.keys(value).some(field => field !== 'dirs')) {
    return true
  }
  const dirs: unknown = Reflect.get(value, 'dirs')
  return (
    Object.hasOwn(value, 'dirs') &&
    dirs !== null &&
    (!isArray(dirs) || !dirs.every(isString))
  )
}
