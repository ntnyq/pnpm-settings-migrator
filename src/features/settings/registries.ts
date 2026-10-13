import { isPlainObject, isString } from '@ntnyq/utils'

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
