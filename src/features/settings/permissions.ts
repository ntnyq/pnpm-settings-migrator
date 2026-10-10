import { isArray, isBoolean, isString } from '@ntnyq/utils'

/**
 * Validate a dependency's capability map without dropping unknown permissions.
 *
 * @param value - Untrusted per-package permission entry
 *
 * @returns Whether pnpm cannot consume every capability in the entry
 */
function hasInvalidPackagePermissions(value: unknown): boolean {
  if (value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  return Object.entries(value).some(
    ([capability, decision]) =>
      !['build', 'skills'].includes(capability) ||
      (decision !== null && !isBoolean(decision) && !isString(decision)),
  )
}

/**
 * Validate permissions and skill directories introduced in pnpm 12.11.
 * Preserve an entire object when a nested value is invalid or ignored upstream.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted source or existing workspace value
 *
 * @returns Whether the setting contains unsupported nested values
 */
export function hasInvalidPermissionSettings(
  key: string,
  value: unknown,
): boolean {
  if (!['permissions', 'skills'].includes(key) || value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  if (key === 'permissions') {
    return Object.values(value).some(hasInvalidPackagePermissions)
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
