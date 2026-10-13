import { isArray, isString } from '@ntnyq/utils'

/**
 * Accept only the project-owned remote cache organization.
 * Keep machine configuration and unknown fields intact in their source.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted incoming or existing workspace value
 *
 * @returns Whether the remote cache setting cannot migrate to project YAML
 */
export function hasInvalidRemoteCacheValue(
  key: string,
  value: unknown,
): boolean {
  if (key !== 'remoteCache' || value === null) {
    return false
  }
  if (!value || typeof value !== 'object' || isArray(value)) {
    return true
  }
  return Object.entries(value).some(
    ([field, entry]) => field !== 'org' || (entry !== null && !isString(entry)),
  )
}
